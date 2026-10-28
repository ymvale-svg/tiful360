import { useState } from "react";
import { Link } from "react-router-dom";
import { Link2, Phone, Plus, Trash2, Users, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalLearningManager } from "@/components/settings/PortalLearningManager";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/feedback/FormField";
import { IconButton } from "@/components/feedback/IconButton";
import { useConfirm } from "@/components/feedback/ConfirmDialog";

export function PortalSettingsTab() {
  const { activeCompanyId } = useCompany();

  if (!activeCompanyId) {
    return <div className="text-center py-8 text-muted-foreground">לא נבחרה חברה</div>;
  }

  return (
    <div className="space-y-6">
      <PortalLearningManager companyId={activeCompanyId} />
      <LinksManager companyId={activeCompanyId} />
      <ContactsManager companyId={activeCompanyId} />
    </div>
  );
}

function LinksManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const { data: links = [] } = useQuery({
    queryKey: ["portal_links", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_links")
        .select("*")
        .eq("company_id", companyId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const addLink = useMutation({
    mutationFn: async () => {
      if (!newLabel || !newUrl) throw new Error("נא למלא שם וכתובת");
      const { error } = await supabase.from("portal_links").insert({
        company_id: companyId,
        label: newLabel,
        url: newUrl,
        sort_order: links.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal_links"] });
      setNewLabel("");
      setNewUrl("");
      toast({ title: "קישור נוסף" });
    },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const deleteLink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("portal_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal_links"] });
      toast({ title: "הקישור הוסר" });
    },
  });
  const removeLink = (link: { id: string; label: string }) => confirm({
    title: `להסיר את הקישור "${link.label}"?`,
    description: "הקישור ייעלם מהפורטל של כל העובדים.",
    confirmLabel: "הסר קישור",
    destructive: true,
    onConfirm: () => deleteLink.mutateAsync(link.id),
  });

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Link2 className="w-5 h-5 text-primary" aria-hidden="true" />
        <h3 className="font-semibold">קישורים מהירים בפורטל</h3>
      </div>

      <div className="space-y-2">
        {links.map((link) => (
          <div key={link.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-background">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{link.label}</p>
              <p className="text-xs text-muted-foreground truncate" dir="ltr">{link.url}</p>
            </div>
            <IconButton label={`הסר את הקישור ${link.label}`} className="shrink-0 text-destructive" onClick={() => { void removeLink(link); }}>
              <Trash2 className="w-4 h-4" />
            </IconButton>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-2 pt-2 border-t border-border/50">
        <FormField label="שם הקישור" id="portal-link-label" className="flex-1">
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="למשל: מערכת שכר" />
        </FormField>
        <FormField label="כתובת" id="portal-link-url" className="flex-1">
          <Input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://..." dir="ltr" className="font-mono" />
        </FormField>
        <Button className="gap-1.5 shrink-0" onClick={() => addLink.mutate()} loading={addLink.isPending} loadingText="מוסיף…">
          <Plus className="w-4 h-4" aria-hidden="true" />
          הוסף
        </Button>
      </div>
    </div>
  );
}

function ContactsManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", role: "", department: "", phone: "", email: "" });

  const { data: contacts = [] } = useQuery({
    queryKey: ["portal_contacts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_contacts")
        .select("*")
        .eq("company_id", companyId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const addContact = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.phone) throw new Error("נא למלא שם וטלפון");
      if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) throw new Error("כתובת דוא\"ל לא תקינה");
      const { error } = await supabase.from("portal_contacts").insert({
        company_id: companyId,
        name: form.name,
        role: form.role,
        department: form.department,
        phone: form.phone,
        email: form.email || null,
        sort_order: contacts.length,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal_contacts"] });
      queryClient.invalidateQueries({ queryKey: ["company-contacts-merged"] });
      setForm({ name: "", role: "", department: "", phone: "", email: "" });
      toast({ title: "איש קשר נוסף" });
    },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("portal_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal_contacts"] });
      queryClient.invalidateQueries({ queryKey: ["company-contacts-merged"] });
      toast({ title: "איש הקשר הוסר" });
    },
  });
  const removeContact = (c: { id: string; name: string }) => confirm({
    title: `להסיר את ${c.name} מאנשי הקשר?`,
    description: "איש הקשר ייעלם מהפורטל של כל העובדים.",
    confirmLabel: "הסר איש קשר",
    destructive: true,
    onConfirm: () => deleteContact.mutateAsync(c.id),
  });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <Phone className="w-5 h-5 text-primary" aria-hidden="true" />
          <h3 className="font-semibold">אנשי קשר חיצוניים</h3>
        </div>
        <Link to="/employees" className="text-sm text-primary hover:underline flex items-center gap-1 shrink-0 min-h-10">
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          לניהול עובדים
          <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </Link>
      </div>

      <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2.5 leading-relaxed">
        עובדי החברה מופיעים אוטומטית ברשימת אנשי הקשר בפורטל. כאן ניתן להוסיף ספקים / יועצים חיצוניים בלבד.
      </p>

      <div className="space-y-2">
        {contacts.map((c: any) => (
          <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-background">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{c.name} <span className="text-muted-foreground">• {c.role}</span></p>
              <p className="text-xs text-muted-foreground">
                {c.department} | {c.phone}
                {c.email ? <> | <span dir="ltr">{c.email}</span></> : null}
              </p>
            </div>
            <IconButton label={`הסר את ${c.name}`} className="shrink-0 text-destructive" onClick={() => { void removeContact(c); }}>
              <Trash2 className="w-4 h-4" />
            </IconButton>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border/50">
        <FormField label="שם" required id="portal-contact-name"><Input value={form.name} onChange={set("name")} autoComplete="off" /></FormField>
        <FormField label="תפקיד" id="portal-contact-role"><Input value={form.role} onChange={set("role")} /></FormField>
        <FormField label="מחלקה" id="portal-contact-dept"><Input value={form.department} onChange={set("department")} /></FormField>
        <FormField label="טלפון" required id="portal-contact-phone"><Input type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} dir="ltr" /></FormField>
        <FormField label="דוא״ל (לא חובה)" id="portal-contact-email" className="sm:col-span-2"><Input type="email" value={form.email} onChange={set("email")} dir="ltr" /></FormField>
      </div>
      <Button className="gap-1.5" onClick={() => addContact.mutate()} loading={addContact.isPending} loadingText="מוסיף…">
        <Plus className="w-4 h-4" aria-hidden="true" />
        הוסף איש קשר חיצוני
      </Button>
    </div>
  );
}

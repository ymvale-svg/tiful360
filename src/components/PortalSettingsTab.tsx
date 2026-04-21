import { useState } from "react";
import { Link } from "react-router-dom";
import { Link2, Phone, Plus, Trash2, Users, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function PortalSettingsTab() {
  const { activeCompanyId } = useCompany();

  if (!activeCompanyId) {
    return <div className="text-center py-8 text-muted-foreground">לא נבחרה חברה</div>;
  }

  return (
    <div className="space-y-6">
      <LinksManager companyId={activeCompanyId} />
      <ContactsManager companyId={activeCompanyId} />
    </div>
  );
}

function LinksManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
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
      toast({ title: "קישור הוסר" });
    },
  });

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Link2 className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">קישורים מהירים בפורטל</h3>
      </div>

      <div className="space-y-2">
        {links.map((link) => (
          <div key={link.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-background">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{link.label}</p>
              <p className="text-xs text-muted-foreground truncate" dir="ltr">{link.url}</p>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-destructive" onClick={() => deleteLink.mutate(link.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border/50">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="שם הקישור"
          className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://..."
          dir="ltr"
          className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
        />
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => addLink.mutate()} disabled={addLink.isPending}>
          <Plus className="w-4 h-4" />
          הוסף
        </Button>
      </div>
    </div>
  );
}

function ContactsManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", role: "", department: "", phone: "" });

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
      const { error } = await supabase.from("portal_contacts").insert({
        company_id: companyId,
        ...form,
        sort_order: contacts.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal_contacts"] });
      setForm({ name: "", role: "", department: "", phone: "" });
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
      toast({ title: "איש קשר הוסר" });
    },
  });

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <Phone className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">אנשי קשר חיצוניים</h3>
        </div>
        <Link to="/employees" className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0">
          <Users className="w-3.5 h-3.5" />
          לניהול עובדים
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2.5 leading-relaxed">
        עובדי החברה מופיעים אוטומטית ברשימת אנשי הקשר בפורטל. כאן ניתן להוסיף ספקים / יועצים חיצוניים בלבד.
      </p>

      <div className="space-y-2">
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-background">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{c.name} <span className="text-muted-foreground">• {c.role}</span></p>
              <p className="text-xs text-muted-foreground">{c.department} | {c.phone}</p>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 text-destructive" onClick={() => deleteContact.mutate(c.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
        <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="שם" className="px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        <input value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))} placeholder="תפקיד" className="px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        <input value={form.department} onChange={(e) => setForm(f => ({ ...f, department: e.target.value }))} placeholder="מחלקה" className="px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        <input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="טלפון" className="px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30" dir="ltr" />
      </div>
      <Button size="sm" className="gap-1.5" onClick={() => addContact.mutate()} disabled={addContact.isPending}>
        <Plus className="w-4 h-4" />
        הוסף איש קשר חיצוני
      </Button>
    </div>
  );
}

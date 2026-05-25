import { useEffect, useState } from "react";
import { ShieldCheck, Save, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props { asset: any }

export function InsuranceDetailsPanel({ asset }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const cf = asset.custom_fields ?? {};

  const initial = () => ({
    insurance_company: cf["חברת ביטוח"] ?? cf.insurance_company ?? asset.insurance_company ?? "",
    policy_number: cf["מספר פוליסה"] ?? cf.policy_number ?? asset.insurance_policy_number ?? "",
    coverage_type: cf["סוג כיסוי"] ?? cf.coverage_type ?? "",
    coverage_amount: cf["סכום כיסוי"] ?? cf.coverage_amount ?? "",
    premium: cf["פרמיה שנתית"] ?? cf["פרמיה"] ?? cf.premium ?? "",
    start_date: cf["תאריך תחילה"] ?? cf.start_date ?? "",
    end_date: asset.expiry_date ?? cf["תאריך סיום"] ?? cf.end_date ?? "",
    agent_name: cf["שם סוכן ביטוח"] ?? cf["סוכן"] ?? cf.agent_name ?? "",
    agent_phone: cf["טלפון סוכן"] ?? cf.agent_phone ?? "",
  });
  const [form, setForm] = useState(initial());
  useEffect(() => { setForm(initial()); /* eslint-disable-next-line */ }, [asset.id]);

  const daysTo = (d?: string | null) => !d ? null : Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  const expiryClass = (d?: string | null) => {
    const days = daysTo(d);
    if (days === null) return "text-muted-foreground";
    if (days < 0) return "text-destructive font-semibold";
    if (days <= 30) return "text-amber-600 dark:text-amber-400 font-semibold";
    return "text-foreground";
  };
  const expiryLabel = (d?: string | null) => {
    const days = daysTo(d);
    if (days === null) return "לא הוגדר";
    if (days < 0) return `פג לפני ${Math.abs(days)} ימים`;
    if (days === 0) return "פג היום";
    if (days <= 30) return `בעוד ${days} ימים`;
    return new Date(d!).toLocaleDateString("en-GB").replace(/\//g, "-");
  };

  const handleSave = async () => {
    setSaving(true);
    // Strip any legacy duplicate keys so we don't store the same value twice.
    const stripped = { ...cf };
    [
      "insurance_company", "policy_number", "coverage_type", "coverage_amount",
      "premium", "annual_premium", "start_date", "end_date", "agent_name", "agent_phone",
      "חברת ביטוח", "מספר פוליסה", "סוג כיסוי", "סכום כיסוי",
      "פרמיה", "פרמיה שנתית", "תאריך תחילה", "תאריך סיום",
      "סוכן", "שם סוכן ביטוח", "סוכן ביטוח", "טלפון סוכן",
    ].forEach((k) => { delete stripped[k]; });

    const newCustom = {
      ...stripped,
      "חברת ביטוח": form.insurance_company || null,
      "מספר פוליסה": form.policy_number || null,
      "סוג כיסוי": form.coverage_type || null,
      "סכום כיסוי": form.coverage_amount || null,
      "פרמיה שנתית": form.premium || null,
      "תאריך תחילה": form.start_date || null,
      "תאריך סיום": form.end_date || null,
      "שם סוכן ביטוח": form.agent_name || null,
      "טלפון סוכן": form.agent_phone || null,
    };
    const { error } = await supabase.from("assets").update({
      custom_fields: newCustom,
      expiry_date: form.end_date || null,
    }).eq("id", asset.id);
    setSaving(false);
    if (error) { toast({ title: "שגיאה בשמירה", description: error.message, variant: "destructive" }); return; }
    toast({ title: "נשמר" });
    qc.invalidateQueries({ queryKey: ["assets"] });
    qc.invalidateQueries({ queryKey: ["expiring-assets"] });
    setEditing(false);
  };


  const F = ({ label, value, v, onChange, ltr, type = "text" }: any) => (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Input type={type} value={v} onChange={(e) => onChange(e.target.value)} className={cn("mt-1", ltr && "text-left")} dir={ltr ? "ltr" : undefined} />
      ) : (
        <div className={cn("font-medium mt-1 text-sm", ltr && "font-mono")}>{value || "—"}</div>
      )}
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> פרטי ביטוח / רגולציה
        </h2>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>ערוך</Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>ביטול</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1"><Save className="w-3.5 h-3.5" /> שמור</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <F label="חברת ביטוח / גוף רגולטורי" value={form.insurance_company} v={form.insurance_company} onChange={(v: string) => setForm({ ...form, insurance_company: v })} />
        <F label="מספר פוליסה / רישום" value={form.policy_number} v={form.policy_number} onChange={(v: string) => setForm({ ...form, policy_number: v })} ltr />
        <F label="סוג כיסוי" value={form.coverage_type} v={form.coverage_type} onChange={(v: string) => setForm({ ...form, coverage_type: v })} />
        <F label="סכום כיסוי" value={form.coverage_amount ? `${Number(form.coverage_amount).toLocaleString()} ₪` : ""} v={form.coverage_amount} onChange={(v: string) => setForm({ ...form, coverage_amount: v })} type="number" />
        <F label="פרמיה" value={form.premium ? `${Number(form.premium).toLocaleString()} ₪` : ""} v={form.premium} onChange={(v: string) => setForm({ ...form, premium: v })} type="number" />
        <F label="תאריך תחילה" value={form.start_date} v={form.start_date} onChange={(v: string) => setForm({ ...form, start_date: v })} type="date" ltr />
        <F label="סוכן / איש קשר" value={form.agent_name} v={form.agent_name} onChange={(v: string) => setForm({ ...form, agent_name: v })} />
        <F label="טלפון סוכן" value={form.agent_phone} v={form.agent_phone} onChange={(v: string) => setForm({ ...form, agent_phone: v })} ltr />
      </div>

      <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">תאריך סיום / חידוש</div>
        {editing ? (
          <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="w-44 text-left" dir="ltr" />
        ) : (
          <div className={cn("text-sm flex items-center gap-1", expiryClass(form.end_date))}>
            {daysTo(form.end_date) !== null && daysTo(form.end_date)! <= 30 && <AlertTriangle className="w-3.5 h-3.5" />}
            {expiryLabel(form.end_date)}
          </div>
        )}
      </div>
    </div>
  );
}

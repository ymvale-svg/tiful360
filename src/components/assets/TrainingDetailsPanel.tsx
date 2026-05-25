import { useEffect, useState } from "react";
import { GraduationCap, Save, AlertTriangle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props { asset: any }

export function TrainingDetailsPanel({ asset }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const cf = asset.custom_fields ?? {};
  const [form, setForm] = useState({
    provider: cf.provider ?? "",
    completed_at: cf.completed_at ?? "",
    certificate_url: cf.certificate_url ?? "",
    score: cf.score ?? "",
    expiry_date: asset.expiry_date ?? "",
  });

  useEffect(() => {
    const c = asset.custom_fields ?? {};
    setForm({
      provider: c.provider ?? "",
      completed_at: c.completed_at ?? "",
      certificate_url: c.certificate_url ?? "",
      score: c.score ?? "",
      expiry_date: asset.expiry_date ?? "",
    });
  }, [asset.id]);

  const daysTo = (d?: string | null) =>
    !d ? null : Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
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
    const newCustom = {
      ...cf,
      provider: form.provider || null,
      completed_at: form.completed_at || null,
      certificate_url: form.certificate_url || null,
      score: form.score || null,
    };
    const { error } = await supabase.from("assets").update({
      custom_fields: newCustom,
      expiry_date: form.expiry_date || null,
    }).eq("id", asset.id);
    setSaving(false);
    if (error) {
      toast({ title: "שגיאה בשמירה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "נשמר" });
    qc.invalidateQueries({ queryKey: ["assets"] });
    qc.invalidateQueries({ queryKey: ["expiring-assets"] });
    setEditing(false);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <GraduationCap className="w-4 h-4" /> פרטי הדרכה / הסמכה
        </h2>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>ערוך</Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>ביטול</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
              <Save className="w-3.5 h-3.5" /> שמור
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <FieldEditable label="ספק / מדריך" value={cf.provider} editing={editing} v={form.provider} onChange={(v) => setForm({ ...form, provider: v })} />
        <div>
          <Label className="text-xs text-muted-foreground">תאריך השלמה</Label>
          {editing ? (
            <Input type="date" value={form.completed_at} onChange={(e) => setForm({ ...form, completed_at: e.target.value })} className="mt-1 text-left" dir="ltr" />
          ) : (
            <div className="font-medium mt-1 text-sm">
              {cf.completed_at ? new Date(cf.completed_at).toLocaleDateString("en-GB").replace(/\//g, "-") : "—"}
            </div>
          )}
        </div>
        <FieldEditable label="ציון/תוצאה" value={cf.score} editing={editing} v={form.score} onChange={(v) => setForm({ ...form, score: v })} />
        <div>
          <Label className="text-xs text-muted-foreground">קישור לתעודה</Label>
          {editing ? (
            <Input value={form.certificate_url} onChange={(e) => setForm({ ...form, certificate_url: e.target.value })} className="mt-1 text-left" dir="ltr" />
          ) : cf.certificate_url ? (
            <a href={cf.certificate_url} target="_blank" rel="noreferrer" className="font-medium mt-1 text-primary inline-flex items-center gap-1 hover:underline text-sm" dir="ltr">
              פתח תעודה <ExternalLink className="w-3 h-3" />
            </a>
          ) : <div className="font-medium mt-1">—</div>}
        </div>
      </div>

      <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">תוקף ההסמכה</div>
        {editing ? (
          <Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} className="w-44 text-left" dir="ltr" />
        ) : (
          <div className={cn("text-sm flex items-center gap-1", expiryClass(asset.expiry_date))}>
            {daysTo(asset.expiry_date) !== null && daysTo(asset.expiry_date)! <= 30 && <AlertTriangle className="w-3.5 h-3.5" />}
            {expiryLabel(asset.expiry_date)}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldEditable({ label, value, editing, v, onChange }: { label: string; value: any; editing: boolean; v: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Input value={v} onChange={(e) => onChange(e.target.value)} className="mt-1" />
      ) : (
        <div className="font-medium mt-1 text-sm">{value ?? "—"}</div>
      )}
    </div>
  );
}

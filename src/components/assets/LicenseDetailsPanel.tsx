import { useEffect, useState } from "react";
import { AppWindow, Save, AlertTriangle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props { asset: any }

export function LicenseDetailsPanel({ asset }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const cf = asset.custom_fields ?? {};
  const [form, setForm] = useState({
    vendor: cf.vendor ?? "",
    plan: cf.plan ?? "",
    seats: cf.seats ?? "",
    account_url: asset.account_url ?? "",
    account_username: asset.account_username ?? "",
    license_expires_at: asset.license_expires_at ?? "",
  });

  useEffect(() => {
    const c = asset.custom_fields ?? {};
    setForm({
      vendor: c.vendor ?? "",
      plan: c.plan ?? "",
      seats: c.seats ?? "",
      account_url: asset.account_url ?? "",
      account_username: asset.account_username ?? "",
      license_expires_at: asset.license_expires_at ?? "",
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
    return new Date(d!).toLocaleDateString("en-GB");
  };

  const handleSave = async () => {
    setSaving(true);
    const newCustom = { ...cf, vendor: form.vendor || null, plan: form.plan || null, seats: form.seats || null };
    const { error } = await supabase.from("assets").update({
      custom_fields: newCustom,
      account_url: form.account_url || null,
      account_username: form.account_username || null,
      license_expires_at: form.license_expires_at || null,
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
          <AppWindow className="w-4 h-4" /> פרטי רישיון
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
        <FieldEditable label="ספק" value={cf.vendor} editing={editing} v={form.vendor} onChange={(v) => setForm({ ...form, vendor: v })} />
        <FieldEditable label="תוכנית/Plan" value={cf.plan} editing={editing} v={form.plan} onChange={(v) => setForm({ ...form, plan: v })} />
        <FieldEditable label="מס׳ מושבים" value={cf.seats} editing={editing} v={form.seats} onChange={(v) => setForm({ ...form, seats: v })} />
        <FieldEditable label="שם משתמש" value={asset.account_username} editing={editing} v={form.account_username} onChange={(v) => setForm({ ...form, account_username: v })} ltr />
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground">כתובת / URL</Label>
          {editing ? (
            <Input value={form.account_url} onChange={(e) => setForm({ ...form, account_url: e.target.value })} className="mt-1 text-left" dir="ltr" />
          ) : asset.account_url ? (
            <a href={asset.account_url} target="_blank" rel="noreferrer" className="font-medium mt-1 text-primary inline-flex items-center gap-1 hover:underline text-sm" dir="ltr">
              {asset.account_url} <ExternalLink className="w-3 h-3" />
            </a>
          ) : <div className="font-medium mt-1">—</div>}
        </div>
      </div>

      <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">תפוגת רישיון</div>
        {editing ? (
          <Input type="date" value={form.license_expires_at} onChange={(e) => setForm({ ...form, license_expires_at: e.target.value })} className="w-44 text-left" dir="ltr" />
        ) : (
          <div className={cn("text-sm flex items-center gap-1", expiryClass(asset.license_expires_at))}>
            {daysTo(asset.license_expires_at) !== null && daysTo(asset.license_expires_at)! <= 30 && <AlertTriangle className="w-3.5 h-3.5" />}
            {expiryLabel(asset.license_expires_at)}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldEditable({ label, value, editing, v, onChange, ltr }: { label: string; value: any; editing: boolean; v: string; onChange: (v: string) => void; ltr?: boolean }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Input value={v} onChange={(e) => onChange(e.target.value)} className={cn("mt-1", ltr && "text-left")} dir={ltr ? "ltr" : undefined} />
      ) : (
        <div className={cn("font-medium mt-1 text-sm", ltr && "font-mono")}>{value ?? "—"}</div>
      )}
    </div>
  );
}

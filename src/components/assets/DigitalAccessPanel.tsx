import { useState, useEffect } from "react";
import { KeyRound, Save, AlertTriangle, Shield, ShieldOff, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface Props {
  asset: any;
}

export function DigitalAccessPanel({ asset }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    account_username: asset.account_username ?? "",
    account_url: asset.account_url ?? "",
    mfa_enabled: asset.mfa_enabled ?? false,
    password_expires_at: asset.password_expires_at ?? "",
    license_expires_at: asset.license_expires_at ?? "",
  });

  useEffect(() => {
    setForm({
      account_username: asset.account_username ?? "",
      account_url: asset.account_url ?? "",
      mfa_enabled: asset.mfa_enabled ?? false,
      password_expires_at: asset.password_expires_at ?? "",
      license_expires_at: asset.license_expires_at ?? "",
    });
  }, [asset.id]);

  const daysTo = (d?: string | null) => {
    if (!d) return null;
    return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };
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
    const payload: any = {
      account_username: form.account_username || null,
      account_url: form.account_url || null,
      mfa_enabled: form.mfa_enabled,
      password_expires_at: form.password_expires_at || null,
      license_expires_at: form.license_expires_at || null,
    };
    const { error } = await supabase.from("assets").update(payload).eq("id", asset.id);
    setSaving(false);
    if (error) {
      toast({ title: "שגיאה בשמירה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "פרטי הגישה נשמרו" });
    qc.invalidateQueries({ queryKey: ["assets"] });
    qc.invalidateQueries({ queryKey: ["expiring-assets"] });
    setEditing(false);
  };

  const ExpiryRow = ({ label, value, field }: { label: string; value?: string | null; field: "password_expires_at" | "license_expires_at" }) => (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      {editing ? (
        <Input type="date" value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} className="w-44 text-left" dir="ltr" />
      ) : (
        <div className={cn("text-sm flex items-center gap-1", expiryClass(value))}>
          {daysTo(value) !== null && daysTo(value)! <= 30 && <AlertTriangle className="w-3.5 h-3.5" />}
          {expiryLabel(value)}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <KeyRound className="w-4 h-4" />
          פרטי גישה דיגיטלית
        </h2>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>ערוך</Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>ביטול</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
              <Save className="w-3.5 h-3.5" />
              שמור
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">שם משתמש</Label>
          {editing ? (
            <Input value={form.account_username} onChange={(e) => setForm({ ...form, account_username: e.target.value })} className="mt-1 text-left" dir="ltr" />
          ) : (
            <div className="font-mono text-sm mt-1">{asset.account_username ?? "—"}</div>
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">כתובת / URL</Label>
          {editing ? (
            <Input value={form.account_url} onChange={(e) => setForm({ ...form, account_url: e.target.value })} className="mt-1 text-left" dir="ltr" />
          ) : asset.account_url ? (
            <a href={asset.account_url} target="_blank" rel="noreferrer" className="font-medium mt-1 text-primary inline-flex items-center gap-1 hover:underline text-sm" dir="ltr">
              {asset.account_url}
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <div className="font-medium mt-1">—</div>
          )}
        </div>
        <div className="col-span-2 flex items-center justify-between py-2 border-t border-border">
          <Label className="text-sm flex items-center gap-2">
            {form.mfa_enabled ? <Shield className="w-4 h-4 text-emerald-600" /> : <ShieldOff className="w-4 h-4 text-muted-foreground" />}
            אימות דו-שלבי (MFA)
          </Label>
          {editing ? (
            <Switch checked={form.mfa_enabled} onCheckedChange={(c) => setForm({ ...form, mfa_enabled: c })} />
          ) : (
            <span className={cn("text-sm font-medium", asset.mfa_enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
              {asset.mfa_enabled === true ? "מופעל" : asset.mfa_enabled === false ? "לא מופעל" : "לא הוגדר"}
            </span>
          )}
        </div>
      </div>

      <div className="pt-3 border-t border-border">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2">תוקפים</h3>
        <ExpiryRow label="תפוגת סיסמה" value={asset.password_expires_at} field="password_expires_at" />
        <ExpiryRow label="תפוגת רישיון" value={asset.license_expires_at} field="license_expires_at" />
      </div>
    </div>
  );
}

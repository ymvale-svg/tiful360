import { useState, useEffect } from "react";
import { Car, Save, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
  asset: any;
}

const FUEL_OPTIONS = ["בנזין", "דיזל", "היברידי", "חשמלי", "גז"];
const VEHICLE_TYPE_OPTIONS = ["צמוד", "מאגר", "ליסינג", "פרטי"];

export function VehicleDetailsPanel({ asset }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    license_plate: asset.license_plate ?? "",
    vehicle_type: asset.vehicle_type ?? "",
    fuel_type: asset.fuel_type ?? "",
    year_of_manufacture: asset.year_of_manufacture ?? "",
    current_km: asset.current_km ?? "",
    test_expiry: asset.test_expiry ?? "",
    insurance_expiry: asset.insurance_expiry ?? "",
    license_expiry: asset.license_expiry ?? "",
    insurance_company: asset.insurance_company ?? "",
    insurance_policy_number: asset.insurance_policy_number ?? "",
  });

  useEffect(() => {
    setForm({
      license_plate: asset.license_plate ?? "",
      vehicle_type: asset.vehicle_type ?? "",
      fuel_type: asset.fuel_type ?? "",
      year_of_manufacture: asset.year_of_manufacture ?? "",
      current_km: asset.current_km ?? "",
      test_expiry: asset.test_expiry ?? "",
      insurance_expiry: asset.insurance_expiry ?? "",
      license_expiry: asset.license_expiry ?? "",
      insurance_company: asset.insurance_company ?? "",
      insurance_policy_number: asset.insurance_policy_number ?? "",
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
      license_plate: form.license_plate || null,
      vehicle_type: form.vehicle_type || null,
      fuel_type: form.fuel_type || null,
      year_of_manufacture: form.year_of_manufacture ? Number(form.year_of_manufacture) : null,
      current_km: form.current_km ? Number(form.current_km) : null,
      test_expiry: form.test_expiry || null,
      insurance_expiry: form.insurance_expiry || null,
      license_expiry: form.license_expiry || null,
      insurance_company: form.insurance_company || null,
      insurance_policy_number: form.insurance_policy_number || null,
    };
    const { error } = await supabase.from("assets").update(payload).eq("id", asset.id);
    setSaving(false);
    if (error) {
      toast({ title: "שגיאה בשמירה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "פרטי הרכב נשמרו" });
    qc.invalidateQueries({ queryKey: ["assets"] });
    qc.invalidateQueries({ queryKey: ["expiring-assets"] });
    setEditing(false);
  };

  const ExpiryRow = ({ label, value, field }: { label: string; value?: string | null; field: "test_expiry" | "insurance_expiry" | "license_expiry" }) => (
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
          <Car className="w-4 h-4" />
          פרטי רכב
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
          <Label className="text-xs text-muted-foreground">לוחית רישוי</Label>
          {editing ? (
            <Input value={form.license_plate} onChange={(e) => setForm({ ...form, license_plate: e.target.value })} className="text-left mt-1" dir="ltr" />
          ) : (
            <div className="font-mono font-medium mt-1">{asset.license_plate ?? "—"}</div>
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">סוג רכב</Label>
          {editing ? (
            <select value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })} className="w-full mt-1 h-9 px-2 rounded-md border border-input bg-background text-sm">
              <option value="">—</option>
              {VEHICLE_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <div className="font-medium mt-1">{asset.vehicle_type ?? "—"}</div>
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">סוג דלק</Label>
          {editing ? (
            <select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })} className="w-full mt-1 h-9 px-2 rounded-md border border-input bg-background text-sm">
              <option value="">—</option>
              {FUEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <div className="font-medium mt-1">{asset.fuel_type ?? "—"}</div>
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">שנת ייצור</Label>
          {editing ? (
            <Input type="number" value={form.year_of_manufacture} onChange={(e) => setForm({ ...form, year_of_manufacture: e.target.value })} className="mt-1" />
          ) : (
            <div className="font-medium mt-1">{asset.year_of_manufacture ?? "—"}</div>
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">קילומטראז' נוכחי</Label>
          {editing ? (
            <Input type="number" value={form.current_km} onChange={(e) => setForm({ ...form, current_km: e.target.value })} className="mt-1" />
          ) : (
            <div className="font-medium mt-1">{asset.current_km ? asset.current_km.toLocaleString() + " ק\"מ" : "—"}</div>
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">חברת ביטוח</Label>
          {editing ? (
            <Input value={form.insurance_company} onChange={(e) => setForm({ ...form, insurance_company: e.target.value })} className="mt-1" />
          ) : (
            <div className="font-medium mt-1">{asset.insurance_company ?? "—"}</div>
          )}
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground">מספר פוליסה</Label>
          {editing ? (
            <Input value={form.insurance_policy_number} onChange={(e) => setForm({ ...form, insurance_policy_number: e.target.value })} className="mt-1 text-left" dir="ltr" />
          ) : (
            <div className="font-mono text-sm mt-1">{asset.insurance_policy_number ?? "—"}</div>
          )}
        </div>
      </div>

      <div className="pt-3 border-t border-border">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2">תוקפים</h3>
        <ExpiryRow label="תוקף טסט" value={asset.test_expiry} field="test_expiry" />
        <ExpiryRow label="תוקף ביטוח" value={asset.insurance_expiry} field="insurance_expiry" />
        <ExpiryRow label="תוקף רישוי" value={asset.license_expiry} field="license_expiry" />
      </div>
    </div>
  );
}

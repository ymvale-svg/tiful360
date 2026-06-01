import { useEffect, useState } from "react";
import { Building, Save, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface Props { asset: any }

const TENURE_OPTIONS = [
  { value: "owned", label: "מניב (בבעלות)" },
  { value: "leased", label: "שכור" },
];

export function RealEstateDetailsPanel({ asset }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const cf = asset.custom_fields ?? {};

  const initial = () => ({
    tenure: cf.tenure ?? "leased",
    address: cf.address ?? "",
    area_sqm: cf.area_sqm ?? "",
    floor: cf.floor ?? "",
    landlord: cf.landlord ?? "",
    landlord_phone: cf.landlord_phone ?? "",
    monthly_rent: cf.monthly_rent ?? "",
    lease_start: cf.lease_start ?? "",
    lease_end: asset.expiry_date ?? cf.lease_end ?? "",
    externally_managed: !!cf.externally_managed,
    management_company: cf.management_company ?? "",
  });
  const [form, setForm] = useState(initial());
  useEffect(() => { setForm(initial()); /* eslint-disable-next-line */ }, [asset.id]);

  const daysTo = (d?: string | null) => !d ? null : Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  const expiryClass = (d?: string | null) => {
    const days = daysTo(d);
    if (days === null) return "text-muted-foreground";
    if (days < 0) return "text-destructive font-semibold";
    if (days <= 60) return "text-amber-600 dark:text-amber-400 font-semibold";
    return "text-foreground";
  };
  const expiryLabel = (d?: string | null) => {
    const days = daysTo(d);
    if (days === null) return "לא הוגדר";
    if (days < 0) return `פג לפני ${Math.abs(days)} ימים`;
    if (days === 0) return "פג היום";
    if (days <= 60) return `בעוד ${days} ימים`;
    return new Date(d!).toLocaleDateString("en-GB");
  };

  const handleSave = async () => {
    setSaving(true);
    const newCustom = {
      ...cf,
      tenure: form.tenure || null,
      address: form.address || null,
      area_sqm: form.area_sqm || null,
      floor: form.floor || null,
      landlord: form.landlord || null,
      landlord_phone: form.landlord_phone || null,
      monthly_rent: form.monthly_rent || null,
      lease_start: form.lease_start || null,
      lease_end: form.lease_end || null,
      externally_managed: form.externally_managed,
      management_company: form.management_company || null,
    };
    const { error } = await supabase.from("assets").update({
      custom_fields: newCustom,
      expiry_date: form.lease_end || null,
    }).eq("id", asset.id);
    setSaving(false);
    if (error) { toast({ title: "שגיאה בשמירה", description: error.message, variant: "destructive" }); return; }
    toast({ title: "נשמר" });
    qc.invalidateQueries({ queryKey: ["assets"] });
    qc.invalidateQueries({ queryKey: ["expiring-assets"] });
    setEditing(false);
  };

  const F = ({ label, value, v, onChange, ltr, type = "text", colSpan }: any) => (
    <div className={colSpan === 2 ? "col-span-2" : ""}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Input type={type} value={v} onChange={(e) => onChange(e.target.value)} className={cn("mt-1", ltr && "text-left")} dir={ltr ? "ltr" : undefined} />
      ) : (
        <div className={cn("font-medium mt-1 text-sm", ltr && "font-mono")}>{value || "—"}</div>
      )}
    </div>
  );

  const isLeased = form.tenure === "leased";

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Building className="w-4 h-4" /> פרטי נכס נדל"ן
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

      {/* Tenure toggle */}
      <div className="flex items-center gap-2">
        {TENURE_OPTIONS.map((o) => (
          <button
            key={o.value}
            disabled={!editing}
            onClick={() => setForm({ ...form, tenure: o.value })}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border transition-colors",
              form.tenure === o.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border",
              editing ? "hover:bg-muted cursor-pointer" : "opacity-80 cursor-default",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <F label="כתובת" value={form.address} v={form.address} onChange={(v: string) => setForm({ ...form, address: v })} colSpan={2} />
        <F label='שטח (מ"ר)' value={form.area_sqm} v={form.area_sqm} onChange={(v: string) => setForm({ ...form, area_sqm: v })} type="number" />
        <F label="קומה" value={form.floor} v={form.floor} onChange={(v: string) => setForm({ ...form, floor: v })} />

        {isLeased && (
          <>
            <F label="בעל הנכס" value={form.landlord} v={form.landlord} onChange={(v: string) => setForm({ ...form, landlord: v })} />
            <F label="טלפון בעל הנכס" value={form.landlord_phone} v={form.landlord_phone} onChange={(v: string) => setForm({ ...form, landlord_phone: v })} ltr />
            <F label='שכ"ד חודשי' value={form.monthly_rent ? `${Number(form.monthly_rent).toLocaleString()} ₪` : ""} v={form.monthly_rent} onChange={(v: string) => setForm({ ...form, monthly_rent: v })} type="number" />
            <F label="תחילת שכירות" value={form.lease_start} v={form.lease_start} onChange={(v: string) => setForm({ ...form, lease_start: v })} type="date" ltr />
          </>
        )}
      </div>

      {/* Externally managed */}
      <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">ניהול חיצוני</div>
          <div className="text-xs text-muted-foreground">הנכס מנוהל ע"י חברת ניהול חיצונית</div>
        </div>
        <Switch
          checked={form.externally_managed}
          onCheckedChange={(v) => editing && setForm({ ...form, externally_managed: v })}
          disabled={!editing}
        />
      </div>
      {form.externally_managed && (
        <F label="חברת ניהול" value={form.management_company} v={form.management_company} onChange={(v: string) => setForm({ ...form, management_company: v })} colSpan={2} />
      )}

      {/* Lease end / expiry */}
      {isLeased && (
        <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">סיום חוזה שכירות</div>
          {editing ? (
            <Input type="date" value={form.lease_end} onChange={(e) => setForm({ ...form, lease_end: e.target.value })} className="w-44 text-left" dir="ltr" />
          ) : (
            <div className={cn("text-sm flex items-center gap-1", expiryClass(form.lease_end))}>
              {daysTo(form.lease_end) !== null && daysTo(form.lease_end)! <= 60 && <AlertTriangle className="w-3.5 h-3.5" />}
              {expiryLabel(form.lease_end)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

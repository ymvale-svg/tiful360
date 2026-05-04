import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Package, FileSignature, History, FileText } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAssetCategories, useEmployees } from "@/hooks/useData";
import { useCategoryFields } from "@/hooks/useCategories";
import { useUpdateAsset } from "@/hooks/useMutations";
import { useToast } from "@/hooks/use-toast";
import { AssignAssetWithFormDialog } from "./AssignAssetWithFormDialog";
import { AssetDocumentsSection } from "./AssetDocumentsSection";
import { CustomFieldsRenderer } from "./CustomFieldsRenderer";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Asset {
  id: string;
  asset_code: string;
  asset_name: string;
  category_id: string;
  serial_number: string | null;
  current_owner_id: string | null;
  status: string;
  manufacturer_model?: string | null;
  condition?: string | null;
  expiry_date: string | null;
  notes: string | null;
  custom_fields?: Record<string, any> | null;
  company_id?: string | null;
  asset_categories?: { category_name?: string | null; prefix?: string | null; is_assignable?: boolean | null } | null;
  employees?: { full_name?: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: Asset | null;
}

export function EditAssetDialog({ open, onOpenChange, asset }: Props) {
  const { data: categories } = useAssetCategories();
  const { data: employees } = useEmployees();
  const mutation = useUpdateAsset();
  const { toast } = useToast();
  const [handoverOpen, setHandoverOpen] = useState(false);

  const [form, setForm] = useState({
    asset_name: "", category_id: "", serial_number: "", current_owner_id: "",
    status: "in_stock", manufacturer_model: "", condition: "good",
    expiry_date: "", notes: "",
  });

  useEffect(() => {
    if (asset) {
      setForm({
        asset_name: asset.asset_name,
        category_id: asset.category_id,
        serial_number: asset.serial_number ?? "",
        current_owner_id: asset.current_owner_id ?? "",
        status: asset.status,
        manufacturer_model: asset.manufacturer_model ?? "",
        condition: asset.condition ?? "good",
        expiry_date: asset.expiry_date ?? "",
        notes: asset.notes ?? "",
      });
    }
  }, [asset]);

  // History of past owners — derived from signed handover forms for this asset
  const { data: handoverHistory } = useQuery({
    queryKey: ["asset-history", asset?.id],
    enabled: !!asset?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_handover_forms")
        .select("id, employee_id, signed_at, created_at, status, pdf_url, attached_document_url")
        .eq("asset_id", asset!.id)
        .eq("status", "signed")
        .order("signed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const empById = useMemo(() => {
    const m = new Map<string, { full_name: string; employee_code: string }>();
    for (const e of employees ?? []) m.set(e.id, { full_name: e.full_name, employee_code: e.employee_code });
    return m;
  }, [employees]);

  // Build ownership periods: each signed form starts a new ownership; previous one ends at next signed_at
  const historyPeriods = useMemo(() => {
    const sorted = [...(handoverHistory ?? [])].sort((a, b) => {
      const ad = new Date(a.signed_at ?? a.created_at).getTime();
      const bd = new Date(b.signed_at ?? b.created_at).getTime();
      return bd - ad;
    });
    return sorted.map((row, idx) => {
      const startedAt = row.signed_at ?? row.created_at;
      // The previous (more recent) period in the array ends this one — but since sorted desc,
      // the row at idx-1 started after this one, so this period ended at sorted[idx-1].signed_at
      const endedAt = idx === 0
        ? null // most recent — still active if matches current owner
        : (sorted[idx - 1].signed_at ?? sorted[idx - 1].created_at);
      const emp = empById.get(row.employee_id);
      const isCurrent = idx === 0 && row.employee_id === asset?.current_owner_id;
      return {
        id: row.id,
        employee_id: row.employee_id,
        employee_name: emp?.full_name ?? "עובד לא ידוע",
        employee_code: emp?.employee_code ?? "",
        startedAt,
        endedAt: isCurrent ? null : endedAt,
        isCurrent,
        document_url: row.pdf_url ?? row.attached_document_url ?? null,
      };
    });
  }, [handoverHistory, empById, asset?.current_owner_id]);


  const handleSubmit = async () => {
    if (!asset) return;
    try {
      await mutation.mutateAsync({
        id: asset.id,
        asset_name: form.asset_name,
        category_id: form.category_id,
        serial_number: form.serial_number || null,
        current_owner_id: form.current_owner_id || null,
        status: form.current_owner_id ? "in_use" : (form.status as any),
        manufacturer_model: form.manufacturer_model || null,
        condition: form.condition,
        expiry_date: form.expiry_date || null,
        notes: form.notes || null,
      });
      toast({ title: "פריט עודכן בהצלחה" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            עריכת פריט ציוד
          </DialogTitle>
          <DialogDescription>מזהה: <span className="font-mono">{asset.asset_code}</span></DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          <div>
            <label className="text-sm font-medium mb-1 block">שם פריט</label>
            <input
              value={form.asset_name}
              onChange={(e) => setForm({ ...form, asset_name: e.target.value })}
              className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">קטגוריה</label>
              <SearchableSelect
                value={form.category_id}
                onChange={(v) => setForm({ ...form, category_id: v })}
                options={(categories ?? []).map(c => ({ value: c.id, label: c.category_name }))}
                placeholder="בחר..."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">מצב הציוד</label>
              <SearchableSelect
                value={form.condition}
                onChange={(v) => setForm({ ...form, condition: v })}
                options={[
                  { value: "new", label: "חדש" },
                  { value: "good", label: "תקין" },
                  { value: "fair", label: "בינוני" },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">יצרן ומודל</label>
              <input
                value={form.manufacturer_model}
                onChange={(e) => setForm({ ...form, manufacturer_model: e.target.value })}
                placeholder="למשל: Apple MacBook Pro 16"
                className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">מספר סידורי</label>
              <input
                value={form.serial_number}
                onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                dir="ltr"
              />
            </div>
          </div>

          {(() => {
            const cat = (categories ?? []).find(c => c.id === form.category_id) as any;
            const isAssignable = cat?.is_assignable !== false; // default true
            return (
              <div className="grid grid-cols-2 gap-3">
                {isAssignable ? (
                  <div>
                    <label className="text-sm font-medium mb-1 block">שיוך לעובד</label>
                    <SearchableSelect
                      value={form.current_owner_id}
                      onChange={(v) => setForm({ ...form, current_owner_id: v })}
                      options={[
                        { value: "", label: "במלאי (ללא שיוך)" },
                        ...(employees ?? [])
                          .filter((e: any) => e.status === "active" || e.status === "onboarding")
                          .map((e: any) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` })),
                      ]}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-sm font-medium mb-1 block">סוג נכס</label>
                    <div className="px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm text-primary">
                      נכס מוסדי (לא משוייך לעובד)
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium mb-1 block">תאריך תפוגה</label>
                  <input
                    type="date"
                    value={form.expiry_date}
                    onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                    className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    dir="ltr"
                  />
                </div>
              </div>
            );
          })()}

          {form.current_owner_id && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="text-sm font-medium flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-primary" />
                טופס מסירת ציוד
              </div>
              <p className="text-xs text-muted-foreground">
                ניתן להפיק טופס חתימה על מסירת הציוד: שליחה לפורטל העובד, חתימה מול מנהל, או צירוף מסמך חתום.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 w-full"
                onClick={() => setHandoverOpen(true)}
              >
                <FileSignature className="w-4 h-4" />
                הפק טופס מסירה
              </Button>
            </div>
          )}

          <div className="rounded-lg border bg-card p-3 space-y-2">
            <div className="text-sm font-medium flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              היסטוריית בעלות
              {historyPeriods.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal">
                  ({historyPeriods.length} רישומים)
                </span>
              )}
            </div>
            {historyPeriods.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                אין היסטוריית מסירות חתומות לפריט זה.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {historyPeriods.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-2 text-xs border-b border-border/50 last:border-0 pb-1.5 last:pb-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground flex items-center gap-1.5 flex-wrap">
                        {p.employee_name}
                        {p.employee_code && (
                          <span className="text-muted-foreground font-mono">({p.employee_code})</span>
                        )}
                        {p.isCurrent && (
                          <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
                            נוכחי
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground mt-0.5">
                        {new Date(p.startedAt).toLocaleDateString("he-IL")}
                        {" — "}
                        {p.endedAt ? new Date(p.endedAt).toLocaleDateString("he-IL") : "כיום"}
                      </div>
                    </div>
                    {p.document_url && (
                      <a
                        href={p.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                        title="צפה בטופס"
                      >
                        <FileText className="w-4 h-4" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <AssetDocumentsSection assetId={asset.id} />

          <div>
            <label className="text-sm font-medium mb-1 block">הערות</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={mutation.isPending}>
              {mutation.isPending ? "שומר..." : "שמור שינויים"}
            </Button>
          </div>
        </div>
      </DialogContent>

      <AssignAssetWithFormDialog
        open={handoverOpen}
        onOpenChange={setHandoverOpen}
        asset={asset ? {
          id: asset.id,
          asset_code: asset.asset_code,
          asset_name: asset.asset_name,
          manufacturer_model: asset.manufacturer_model ?? null,
          condition: asset.condition ?? null,
          company_id: asset.company_id ?? null,
          current_owner_id: form.current_owner_id || asset.current_owner_id,
          asset_categories: asset.asset_categories ?? null,
          employees: asset.employees ?? null,
        } : null}
      />
    </Dialog>
  );
}

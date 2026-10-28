import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Package, FileSignature, History, FileText, Pencil } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SubCategorySelect } from "@/components/assets/SubCategorySelect";
import { useAssetCategories, useEmployees } from "@/hooks/useData";
import { useAssetGroups } from "@/hooks/useAssetGroups";
import { useCategoryFields, filterFieldsForGroup } from "@/hooks/useCategories";
import { useUpdateAsset } from "@/hooks/useMutations";
import { useToast } from "@/hooks/use-toast";
import { HandoverFlow } from "@/components/handover/HandoverFlow";
import { AssetDocumentsSection } from "./AssetDocumentsSection";
import { CustomFieldsRenderer } from "./CustomFieldsRenderer";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ManufacturerModelInput } from "@/components/assets/ManufacturerModelInput";
import { SiteSelect } from "@/components/sites/SiteSelect";
import { ContainerSelect } from "@/components/sites/ContainerSelect";
import { useSiteContainers } from "@/hooks/useSiteContainers";
import { useSites } from "@/hooks/useSites";
import { openHandoverFile } from "@/lib/handoverUrl";
import { showFieldRow } from "@/lib/builtinFields";
import { useProtocolTemplates } from "@/hooks/useProtocolTemplates";
import { getDomain } from "@/lib/assetDomains";
import { isVehicleLinkedGroup } from "@/lib/vehicleLinkedGroups";
import { useDirtyGuard } from "@/components/feedback/useDirtyGuard";
import { IconButton } from "@/components/feedback/IconButton";


const INSURANCE_TYPES = ["רכב", "דירקטורים", "צד ג׳", "קבלני"];
const INSURANCE_FIELD = "סוג ביטוח";

interface Asset {
  id: string;
  asset_code: string;
  asset_name: string;
  category_id: string;
  group_id?: string | null;
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
  const [mode, setMode] = useState<"view" | "edit">("view");

  const [form, setForm] = useState({
    asset_name: "", category_id: "", group_id: "", serial_number: "", current_owner_id: "",
    assigned_site_id: "", container_id: "",
    status: "in_stock", manufacturer_model: "", condition: "good",
    expiry_date: "", notes: "", notification_days_before: "" as string,
  });
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Snapshot of the saved values, to tell whether the edit form has unsaved changes.
  const [baseline, setBaseline] = useState("");

  const { data: catFieldsRaw } = useCategoryFields(form.category_id);
  const { data: assetGroups } = useAssetGroups();
  const selectedCategory = (categories ?? []).find((c: any) => c.id === form.category_id) as any;
  const categoryGroups = useMemo(
    () => (assetGroups ?? []).filter(g => g.category_id === form.category_id),
    [assetGroups, form.category_id]
  );
  const selectedGroup = useMemo(
    () => categoryGroups.find(g => g.id === form.group_id) ?? null,
    [categoryGroups, form.group_id]
  );
  const domain = getDomain(selectedCategory as any);
  /** Relevant fields only: per-sub-category config, falling back to the domain defaults. */
  const showField = (key: string, value: unknown, editing: boolean) =>
    showFieldRow(selectedGroup as any, key, value, editing, domain);

  // The handover section appears only when a handover protocol is defined for
  // this sub-category (most specific) or its category.
  const { data: protocolTemplates } = useProtocolTemplates(asset?.company_id ?? null);
  const hasHandoverProtocol = useMemo(() => {
    if (!protocolTemplates) return false;
    const gid = form.group_id || null;
    return protocolTemplates.some((t: any) =>
      (gid && t.group_id === gid) ||
      (!t.group_id && t.category_id === form.category_id),
    );
  }, [protocolTemplates, form.group_id, form.category_id]);
  const catFields = filterFieldsForGroup(catFieldsRaw as any[], form.group_id || null).filter((cf: any) => {
    if (selectedCategory?.prefix === "CINS" && cf.field_name === "תוקף פוליסה") return false;
    return true;
  });

  /** Load the form from the saved asset (used on open and on "ביטול"). */
  const resetFromAsset = (a: Asset) => {
    const next = {
      asset_name: a.asset_name,
      category_id: a.category_id,
      group_id: (a as any).group_id ?? "",
      serial_number: a.serial_number ?? "",
      current_owner_id: a.current_owner_id ?? "",
      assigned_site_id: (a as any).assigned_site_id ?? "",
      container_id: (a as any).container_id ?? "",
      status: a.status,
      manufacturer_model: a.manufacturer_model ?? "",
      condition: a.condition ?? "good",
      expiry_date: a.expiry_date ?? "",
      notes: a.notes ?? "",
      notification_days_before: (a as any).notification_days_before == null ? "" : String((a as any).notification_days_before),
    };
    setForm(next);
    // Load existing custom_fields as strings
    const cf: Record<string, string> = {};
    const raw = (a as any).custom_fields ?? {};
    Object.keys(raw).forEach((k) => { cf[k] = raw[k] == null ? "" : String(raw[k]); });
    setCustomFields(cf);
    setBaseline(JSON.stringify([next, cf]));
    setErrors({});
    setMode("view");
  };

  // Re-init whenever the dialog opens or shows another asset, so unsaved
  // edits from a previous session never leak back in.
  useEffect(() => {
    if (open && asset) resetFromAsset(asset);
  }, [asset?.id, open]);

  // Owner changes happen in the handover protocol; when it completes, pick up the new owner
  // so a later "שמור שינויים" never writes the previous owner back.
  useEffect(() => {
    if (!asset) return;
    const owner = asset.current_owner_id ?? "";
    const site = (asset as any).assigned_site_id ?? "";
    const container = (asset as any).container_id ?? "";
    const status = asset.status;
    setForm((prev) => ({ ...prev, current_owner_id: owner, assigned_site_id: site, container_id: container, status }));
    setBaseline((prev) => {
      if (!prev) return prev;
      try {
        const [f, cf] = JSON.parse(prev);
        return JSON.stringify([{ ...f, current_owner_id: owner, assigned_site_id: site, container_id: container, status }, cf]);
      } catch { return prev; }
    });
  }, [asset?.current_owner_id, (asset as any)?.assigned_site_id, (asset as any)?.container_id, asset?.status]); // eslint-disable-line react-hooks/exhaustive-deps

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


  // Hooks must run before the early return below (Rules of Hooks).
  const { data: sites } = useSites();
  const { data: containers } = useSiteContainers(form.assigned_site_id || null);

  const isDirty = mode === "edit" && baseline !== "" && JSON.stringify([form, customFields]) !== baseline;
  const guard = useDirtyGuard(isDirty, mutation.isPending);
  /** "ביטול" in edit mode: ask before dropping changes, then return to the saved values. */
  const cancelEdit = guard((o) => { if (!o && asset) resetFromAsset(asset); });

  /** Same required-field checks as AddAssetDialog. */
  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.asset_name.trim()) e.asset_name = "שדה חובה";
    if (!form.category_id) e.category_id = "נא לבחור קטגוריה";
    if (categoryGroups.length > 0 && !form.group_id) e.group_id = "נא לבחור תת-קטגוריה";
    (catFields ?? []).forEach((cf: any) => {
      if (cf.is_required && !String(customFields[cf.field_name] ?? "").trim()) e[`cf_${cf.field_name}`] = `${cf.field_name}: שדה חובה`;
    });
    setErrors(e);
    if (Object.keys(e).length) {
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>('[data-edit-asset] [aria-invalid="true"], [data-edit-asset] [data-invalid="true"] button');
        el?.focus();
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 0);
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!asset) return;
    if (!validate()) return;
    try {
      // Strip empty custom field values
      const cleanCustom: Record<string, string> = {};
      Object.entries(customFields).forEach(([k, v]) => {
        if (v && v.toString().trim() !== "") cleanCustom[k] = v;
      });
      await mutation.mutateAsync({
        id: asset.id,
        asset_name: form.asset_name.trim(),
        category_id: form.category_id,
        group_id: form.group_id || null,
        serial_number: form.serial_number || null,
        current_owner_id: form.current_owner_id || null,
        assigned_site_id: form.assigned_site_id || null,
        container_id: form.assigned_site_id ? (form.container_id || null) : null,
        status: (form.current_owner_id || form.assigned_site_id) ? "in_use" : (form.status as any),
        manufacturer_model: form.manufacturer_model || null,
        condition: form.condition,
        expiry_date: form.expiry_date || null,
        notes: form.notes || null,
        custom_fields: cleanCustom,
        notification_days_before: form.notification_days_before.trim() === "" ? null : Number(form.notification_days_before),
      } as any);
      toast({ title: "פריט עודכן בהצלחה" });
      setBaseline(JSON.stringify([form, customFields]));
      setMode("view");
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  if (!asset) return null;

  const isView = mode === "view";
  const inputCls = "w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30";
  const readCls = "w-full px-3 py-2 bg-muted/40 rounded-lg text-sm min-h-[40px]";
  const display = (v: string | null | undefined) =>
    v && String(v).trim() !== "" ? String(v) : <span className="text-muted-foreground">—</span>;

  const ownerName = (employees ?? []).find((e: any) => e.id === form.current_owner_id)?.full_name;
  const siteName = form.assigned_site_id
    ? (() => { const s = (sites ?? []).find((s) => s.id === form.assigned_site_id); return s ? (s.address ? `${s.name} — ${s.address}` : s.name) : null; })()
    : null;
  const containerName = form.container_id
    ? (containers ?? []).find((c) => c.id === form.container_id)?.name ?? null
    : null;
  const categoryName = (categories ?? []).find((c: any) => c.id === form.category_id)?.category_name;
  const conditionLabels: Record<string, string> = { new: "חדש", good: "תקין", fair: "בינוני" };

  return (
    <Dialog open={open} onOpenChange={guard(onOpenChange)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl" data-edit-asset="">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              {selectedCategory?.prefix === "CINS"
                ? (isView ? "פרטי פוליסת ביטוח" : "עריכת פוליסת ביטוח")
                : (isView ? "פרטי פריט ציוד" : "עריכת פריט ציוד")}
            </span>
            {isView && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMode("edit")}>
                <Pencil className="w-3.5 h-3.5" />
                ערוך
              </Button>
            )}
          </DialogTitle>
          <DialogDescription>מזהה: <span className="font-mono">{asset.asset_code}</span></DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          <div>
            <label htmlFor="edit-asset-name" className="text-sm font-medium mb-1 block">
              {selectedCategory?.prefix === "CINS" ? "שם הפוליסה" : "שם פריט"}
              {!isView && <span className="text-destructive mr-1" aria-hidden="true">*</span>}
            </label>
            {isView ? (
              <div className={readCls}>{display(form.asset_name)}</div>
            ) : (
              <>
                <input
                  id="edit-asset-name"
                  aria-required="true"
                  aria-invalid={errors.asset_name ? true : undefined}
                  aria-describedby={errors.asset_name ? "edit-asset-name-error" : undefined}
                  value={form.asset_name}
                  onChange={(e) => { setForm({ ...form, asset_name: e.target.value }); setErrors(({ asset_name: _, ...rest }) => rest); }}
                  className={cn(inputCls, errors.asset_name && "ring-2 ring-destructive/50")}
                />
                {errors.asset_name && <p id="edit-asset-name-error" role="alert" className="text-xs text-destructive mt-1">{errors.asset_name}</p>}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div role="group" aria-labelledby="edit-asset-category-label" data-invalid={errors.category_id ? "true" : undefined}>
              <label id="edit-asset-category-label" className="text-sm font-medium mb-1 block">קטגוריה</label>
              {isView ? (
                <div className={readCls}>{display(categoryName)}</div>
              ) : (
                <SearchableSelect
                  value={form.category_id}
                  onChange={(v) => setForm({ ...form, category_id: v, group_id: "" })}
                  options={(categories ?? []).map(c => ({ value: c.id, label: c.category_name }))}
                  placeholder="בחר..."
                  error={!!errors.category_id}
                />
              )}
              {!isView && errors.category_id && <p role="alert" className="text-xs text-destructive mt-1">{errors.category_id}</p>}
            </div>
            {(categoryGroups.length > 0 || (!isView && form.category_id)) && (
              <div role="group" aria-labelledby="edit-asset-group-label" data-invalid={errors.group_id ? "true" : undefined}>
                <label id="edit-asset-group-label" className="text-sm font-medium mb-1 block">תת-קטגוריה</label>
                {isView ? (
                  <div className={readCls}>{display(categoryGroups.find(g => g.id === form.group_id)?.name)}</div>
                ) : (
                  <SubCategorySelect
                    categoryId={form.category_id}
                    companyId={(selectedCategory as any)?.company_id ?? asset?.company_id ?? null}
                    defaultOwnerRole={(selectedCategory as any)?.default_owner_role ?? null}
                    value={form.group_id}
                    onChange={(v) => setForm({ ...form, group_id: v })}
                    error={!!errors.group_id}
                  />
                )}
                {!isView && errors.group_id && <p role="alert" className="text-xs text-destructive mt-1">{errors.group_id}</p>}
              </div>
            )}
            {(selectedCategory as any)?.is_assignable !== false && showField("condition", form.condition, !isView) && (
              <div>
                <label className="text-sm font-medium mb-1 block">מצב הציוד</label>
                {isView ? (
                  <div className={readCls}>{display(conditionLabels[form.condition] ?? form.condition)}</div>
                ) : (
                  <SearchableSelect
                    value={form.condition}
                    onChange={(v) => setForm({ ...form, condition: v })}
                    options={[
                      { value: "new", label: "חדש" },
                      { value: "good", label: "תקין" },
                      { value: "fair", label: "בינוני" },
                    ]}
                  />
                )}
              </div>
            )}
          </div>


          {selectedCategory?.prefix !== "CINS" && selectedCategory?.prefix !== "CAR" && showField("manufacturer_model", form.manufacturer_model, !isView) && (
            <div>
              <label className="text-sm font-medium mb-1 block">יצרן ומודל</label>
              {isView ? (
                <div className={readCls}>{display(form.manufacturer_model)}</div>
              ) : (
                <ManufacturerModelInput
                  value={form.manufacturer_model}
                  onChange={(v) => setForm({ ...form, manufacturer_model: v })}
                  groupId={form.group_id || null}
                />

              )}
            </div>
          )}

          {(() => {
            const cat = (categories ?? []).find(c => c.id === form.category_id) as any;
            const isAssignable = cat?.is_assignable !== false; // default true
            const isInsurance = cat?.prefix === "CINS";
            return (
              <div className={cn("grid gap-3", isInsurance ? "grid-cols-1" : "grid-cols-2")}>
                {isInsurance ? null : isAssignable ? (
                  <div>
                    <span className="text-sm font-medium mb-1 block">שיוך לעובד</span>
                    <div className={readCls}>{ownerName ? ownerName : <span className="text-muted-foreground">ללא שיוך לעובד</span>}</div>
                    {/* Changing the owner always goes through the handover protocol, so it is signed and logged. */}
                    {!isView && (
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto min-h-9 px-0 text-xs"
                        onClick={() => setHandoverOpen(true)}
                      >
                        <FileSignature className="w-3.5 h-3.5" aria-hidden="true" />
                        {form.current_owner_id ? "העברה לעובד אחר — בפרוטוקול מסירה" : "שיוך לעובד — בפרוטוקול מסירה"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="text-sm font-medium mb-1 block">סוג נכס</label>
                    <div className="px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm text-primary">
                      נכס מוסדי (לא משוייך לעובד)
                    </div>
                  </div>
                )}
                {selectedCategory?.prefix !== "CAR" && showField("expiry_date", form.expiry_date, !isView) && (
                  <div>
                    <label htmlFor="edit-asset-expiry" className="text-sm font-medium mb-1 block">
                      {isInsurance ? "תוקף עד" : "תאריך תפוגה"}
                    </label>
                    {isView ? (
                      <div className={readCls} dir="ltr">{form.expiry_date ? new Date(form.expiry_date).toLocaleDateString("en-GB") : display(null)}</div>
                    ) : (
                      <input
                        id="edit-asset-expiry"
                        type="date"
                        value={form.expiry_date}
                        onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                        className={inputCls}
                        dir="ltr"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {selectedCategory?.prefix !== "CINS" && selectedCategory?.is_assignable !== false && showField("assigned_site_id", form.assigned_site_id, !isView) && (
            <div>
              {isView ? (
                <>
                  <label className="text-sm font-medium mb-1 block">שיוך לאתר</label>
                  <div className={readCls}>
                    {siteName ?? <span className="text-muted-foreground">ללא שיוך לאתר</span>}
                    {containerName && <span className="block text-xs text-muted-foreground mt-0.5">מכולה: {containerName}</span>}
                  </div>
                </>
              ) : (
                <>
                  <SiteSelect
                    value={form.assigned_site_id}
                    onChange={(v) => setForm({ ...form, assigned_site_id: v, container_id: "", ...(v ? { current_owner_id: "" } : {}) })}
                    label="שיוך לאתר (במקום עובד)"
                  />
                  {form.assigned_site_id && (
                    <button
                      type="button"
                      className="min-h-9 text-xs text-destructive hover:underline mt-1"
                      onClick={() => setForm({ ...form, assigned_site_id: "", container_id: "" })}
                    >
                      הסר שיוך לאתר
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {!isView && form.assigned_site_id && (
            <ContainerSelect
              siteId={form.assigned_site_id}
              value={form.container_id}
              onChange={(v) => setForm({ ...form, container_id: v })}
              label="מכולה (מיקום אחסון באתר)"
            />
          )}

          {showField("notification_days_before", form.notification_days_before, !isView) && (
          <div>
            <label htmlFor="edit-asset-notify-days" className="text-sm font-medium mb-1 block">
              התראת מייל מראש (ימים לפני תפוגה)
            </label>
            {isView ? (
              <div className={readCls} dir="ltr">
                {form.notification_days_before !== "" ? `${form.notification_days_before} ימים` : `ברירת מחדל (${(selectedCategory as any)?.default_notification_days_before ?? 14} ימים)`}
              </div>
            ) : (
              <>
                <input
                  id="edit-asset-notify-days"
                  aria-describedby="edit-asset-notify-days-hint"
                  type="number"
                  min={0}
                  max={365}
                  value={form.notification_days_before}
                  onChange={(e) => setForm({ ...form, notification_days_before: e.target.value })}
                  placeholder={`ברירת מחדל: ${(selectedCategory as any)?.default_notification_days_before ?? 14} ימים`}
                  className={inputCls}
                  dir="ltr"
                />
                <p id="edit-asset-notify-days-hint" className="text-xs text-muted-foreground mt-1">
                  השאר ריק כדי להשתמש בברירת המחדל של הקטגוריה.
                </p>
              </>
            )}
          </div>
          )}

          {form.current_owner_id && hasHandoverProtocol && (
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

          {selectedCategory?.prefix !== "CINS" && (
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
                            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs">
                              נוכחי
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground mt-0.5">
                          {new Date(p.startedAt).toLocaleDateString("en-GB")}
                          {" — "}
                          {p.endedAt ? new Date(p.endedAt).toLocaleDateString("en-GB") : "כיום"}
                        </div>
                      </div>
                      {p.document_url && (
                        <IconButton
                          type="button"
                          label={`צפה בטופס המסירה של ${p.employee_name}`}
                          onClick={() => void openHandoverFile(p.document_url!)}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <FileText aria-hidden="true" />
                        </IconButton>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {(catFields ?? []).length > 0 && (
            <CustomFieldsRenderer
              fields={catFields as any}
              values={customFields}
              onChange={(name, value) => setCustomFields((prev) => ({ ...prev, [name]: value }))}
              categoryPrefix={selectedCategory?.prefix}
              title="פרטי קטגוריה"
              readOnly={isView}
            />
          )}

          <AssetDocumentsSection assetId={asset.id} />

          <div>
            <label htmlFor="edit-asset-notes" className="text-sm font-medium mb-1 block">הערות</label>
            {isView ? (
              <div className={`${readCls} whitespace-pre-wrap`}>{display(form.notes)}</div>
            ) : (
              <textarea
                id="edit-asset-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className={`${inputCls} resize-none`}
              />
            )}
          </div>

          {!isView && Object.keys(errors).length > 0 && (
            <p role="alert" className="text-sm text-destructive">
              {Object.keys(errors).length === 1 ? "יש שדה אחד לתיקון." : `יש ${Object.keys(errors).length} שדות לתיקון.`}
              {Object.entries(errors).filter(([k]) => k.startsWith("cf_")).map(([k, v]) => <span key={k} className="block text-xs">{v}</span>)}
            </p>
          )}

          <div className="flex gap-3 pt-3">
            {isView ? (
              <>
                <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>סגור</Button>
                <Button className="flex-1 gap-2" onClick={() => setMode("edit")}>
                  <Pencil className="w-4 h-4" />
                  ערוך
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" className="flex-1" onClick={() => cancelEdit(false)} disabled={mutation.isPending}>ביטול</Button>
                <Button className="flex-1" onClick={handleSubmit} disabled={mutation.isPending}>
                  {mutation.isPending ? "שומר..." : "שמור שינויים"}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>

      <HandoverFlow
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

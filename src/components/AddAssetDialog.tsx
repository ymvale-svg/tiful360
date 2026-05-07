import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Package, AlertCircle, Users, User, Search, Copy, CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { useCreateAsset } from "@/hooks/useMutations";
import { useAssetCategories, useEmployees, useAssets } from "@/hooks/useData";
import { useCategoryFields } from "@/hooks/useCategories";
import { useUploadAssetDocument } from "@/hooks/useAssetDocuments";
import { FileText, Upload, Trash2 } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCategoryId?: string;
}

const INSURANCE_TYPES = ["רכב", "דירקטורים", "צד ג׳", "קבלני"];
const INSURANCE_FIELD = "סוג ביטוח";

// Field keys used internally
const SYSTEM_FIELD_KEYS = {
  asset_code: "__asset_code",
  serial_number: "__serial_number",
  expiry_date: "__expiry_date",
};

const PER_EMP_KEYWORDS = [
  "משתמש", "username", "user", "סיסמה", "password", "רישיון", "license",
  "imei", "מזהה", "token", "email", "מייל", "לוחית", "רישוי",
];

function isPerEmployeeByName(name: string): boolean {
  const lower = name.toLowerCase();
  return PER_EMP_KEYWORDS.some(k => lower.includes(k));
}

// Categories where expiry_date is per-employee by default
const PER_EMP_EXPIRY_PREFIXES = ["VHC", "EQP"];

export function AddAssetDialog({ open, onOpenChange, defaultCategoryId }: Props) {
  const { activeCompanyId } = useCompany();
  const { data: categories } = useAssetCategories();
  const { data: employees } = useEmployees();
  const { data: existingAssets } = useAssets();
  const mutation = useCreateAsset();
  const uploadDoc = useUploadAssetDocument();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [pendingDocs, setPendingDocs] = useState<File[]>([]);
  const [docDragging, setDocDragging] = useState(false);

  const [form, setForm] = useState({
    asset_code: "",
    asset_name: "",
    category_id: "",
    serial_number: "",
    current_owner_id: "",
    status: "in_stock" as "in_use" | "in_stock" | "in_repair",
    expiry_date: "",
    notes: "",
  });
  const [customFields, setCustomFields] = useState<Record<string, string>>({});

  // Bulk mode state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [empDeptFilter, setEmpDeptFilter] = useState<string>("");
  const [perEmpFieldKeys, setPerEmpFieldKeys] = useState<Set<string>>(new Set());
  const [perEmpRows, setPerEmpRows] = useState<Record<string, Record<string, string>>>({});

  const { data: catFields } = useCategoryFields(form.category_id);
  const selectedCategory = categories?.find(c => c.id === form.category_id);

  // Reset everything when dialog closes
  useEffect(() => {
    if (!open) {
      setForm({
        asset_code: "", asset_name: "", category_id: "", serial_number: "",
        current_owner_id: "", status: "in_stock", expiry_date: "", notes: "",
      });
      setCustomFields({});
      setBulkMode(false);
      setSelectedEmployeeIds([]);
      setEmpSearch("");
      setEmpDeptFilter("");
      setPerEmpFieldKeys(new Set());
      setPerEmpRows({});
      setErrors({});
      setPendingDocs([]);
      setDocDragging(false);
    } else if (defaultCategoryId) {
      setForm(prev => ({ ...prev, category_id: defaultCategoryId }));
    }
  }, [open, defaultCategoryId]);

  // Compute per-employee field keys defaults when category or fields change
  useEffect(() => {
    if (!selectedCategory) return;
    const next = new Set<string>();
    next.add(SYSTEM_FIELD_KEYS.asset_code);
    next.add(SYSTEM_FIELD_KEYS.serial_number);
    if (PER_EMP_EXPIRY_PREFIXES.includes(selectedCategory.prefix)) {
      next.add(SYSTEM_FIELD_KEYS.expiry_date);
    }
    (catFields ?? []).forEach(cf => {
      if (isPerEmployeeByName(cf.field_name)) next.add(`cf:${cf.field_name}`);
    });
    setPerEmpFieldKeys(next);
    setPerEmpRows({});
  }, [form.category_id, catFields, selectedCategory]);

  // Auto-generate single asset_code (non-bulk) — running counter per category, never resets
  useEffect(() => {
    if (form.category_id && categories && existingAssets && !bulkMode) {
      const cat = categories.find(c => c.id === form.category_id);
      if (cat) {
        const pattern = `${cat.prefix}-`;
        // Find max numeric suffix among existing codes for this prefix
        const maxNum = existingAssets
          .filter(a => a.asset_code.startsWith(pattern))
          .reduce((max, a) => {
            const tail = a.asset_code.slice(pattern.length);
            // Take only the trailing numeric part (handles legacy MMYY-NNN format too)
            const m = tail.match(/(\d+)\s*$/);
            const n = m ? parseInt(m[1], 10) : 0;
            return n > max ? n : max;
          }, 0);
        const nextNum = maxNum + 1;
        setForm(prev => ({
          ...prev,
          asset_code: `${cat.prefix}-${String(nextNum).padStart(4, "0")}`,
        }));
      }
    }
  }, [form.category_id, categories, existingAssets, bulkMode]);

  // Auto-set status based on owner (single mode)
  useEffect(() => {
    if (!bulkMode && form.current_owner_id) {
      setForm(prev => ({ ...prev, status: "in_use" }));
    }
  }, [form.current_owner_id, bulkMode]);

  // When bulk toggled on, initialize asset codes for selected employees
  useEffect(() => {
    if (!bulkMode || !selectedCategory || !existingAssets) return;
    setPerEmpRows(prev => {
      const next: Record<string, Record<string, string>> = { ...prev };
      const pattern = `${selectedCategory.prefix}-`;
      const maxNum = existingAssets
        .filter(a => a.asset_code.startsWith(pattern))
        .reduce((max, a) => {
          const tail = a.asset_code.slice(pattern.length);
          const m = tail.match(/(\d+)\s*$/);
          const n = m ? parseInt(m[1], 10) : 0;
          return n > max ? n : max;
        }, 0);
      selectedEmployeeIds.forEach((empId, idx) => {
        if (!next[empId]) next[empId] = {};
        if (!next[empId][SYSTEM_FIELD_KEYS.asset_code]) {
          next[empId][SYSTEM_FIELD_KEYS.asset_code] =
            `${selectedCategory.prefix}-${String(maxNum + idx + 1).padStart(4, "0")}`;
        }
      });
      // Cleanup rows of unselected employees
      Object.keys(next).forEach(id => {
        if (!selectedEmployeeIds.includes(id)) delete next[id];
      });
      return next;
    });
  }, [bulkMode, selectedCategory, selectedEmployeeIds, existingAssets]);

  const set = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const togglePerEmpField = (key: string) => {
    setPerEmpFieldKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setPerEmpValue = (empId: string, fieldKey: string, value: string) => {
    setPerEmpRows(prev => ({
      ...prev,
      [empId]: { ...(prev[empId] ?? {}), [fieldKey]: value },
    }));
  };

  const copyToAll = (fieldKey: string) => {
    if (selectedEmployeeIds.length === 0) return;
    const firstId = selectedEmployeeIds[0];
    const value = perEmpRows[firstId]?.[fieldKey] ?? "";
    if (!value) {
      toast({ title: "אין ערך להעתקה", description: "מלא ערך בשורה הראשונה ונסה שוב", variant: "destructive" });
      return;
    }
    setPerEmpRows(prev => {
      const next = { ...prev };
      selectedEmployeeIds.forEach(id => {
        next[id] = { ...(next[id] ?? {}), [fieldKey]: value };
      });
      return next;
    });
  };

  const activeEmployees = useMemo(
    () => (employees ?? []).filter(e => e.status === "active" || e.status === "onboarding"),
    [employees]
  );

  const departments = useMemo(
    () => Array.from(new Set(activeEmployees.map(e => e.department).filter(Boolean))).sort(),
    [activeEmployees]
  );

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    return activeEmployees.filter(e => {
      if (empDeptFilter && e.department !== empDeptFilter) return false;
      if (q && !e.full_name.toLowerCase().includes(q) && !e.employee_code.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activeEmployees, empSearch, empDeptFilter]);

  const toggleEmployee = (id: string) => {
    setSelectedEmployeeIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllVisible = () => {
    setSelectedEmployeeIds(prev => Array.from(new Set([...prev, ...filteredEmployees.map(e => e.id)])));
  };

  const clearSelection = () => setSelectedEmployeeIds([]);

  // ============ Single mode submit ============
  const handleSubmitSingle = async () => {
    const e: Record<string, string> = {};
    if (!form.asset_code.trim()) e.asset_code = "שדה חובה";
    else if (existingAssets?.some(a => a.asset_code === form.asset_code))
      e.asset_code = "מזהה פריט כבר קיים במערכת";
    if (!form.asset_name.trim()) e.asset_name = "שדה חובה";
    if (!form.category_id) e.category_id = "נא לבחור קטגוריה";
    if (form.serial_number && existingAssets?.some(a => a.serial_number === form.serial_number))
      e.serial_number = "מספר סידורי כבר קיים במערכת";
    (catFields ?? []).forEach(cf => {
      if (cf.is_required && !customFields[cf.field_name]) {
        e[`cf_${cf.field_name}`] = "שדה חובה";
      }
    });

    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast({ title: "שגיאת ולידציה", description: "נא לתקן את השגיאות המסומנות", variant: "destructive" });
      return;
    }
    try {
      const created = await mutation.mutateAsync({
        asset_code: form.asset_code,
        asset_name: form.asset_name,
        category_id: form.category_id,
        serial_number: form.serial_number || undefined,
        current_owner_id: form.current_owner_id || undefined,
        status: form.status,
        custom_fields: Object.keys(customFields).length > 0 ? customFields : undefined,
        expiry_date: form.expiry_date || undefined,
        notes: form.notes || undefined,
      });
      // Upload pending documents (if any)
      if (pendingDocs.length > 0 && (created as any)?.id) {
        const assetId = (created as any).id;
        for (const file of pendingDocs) {
          try {
            await uploadDoc.mutateAsync({ asset_id: assetId, file, document_type: "other" });
          } catch (uerr: any) {
            toast({ title: `שגיאה בהעלאת ${file.name}`, description: uerr.message, variant: "destructive" });
          }
        }
      }
      const catName = selectedCategory?.category_name ?? "פריט";
      toast({ title: `${catName} נוסף בהצלחה`, description: form.asset_name });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  // ============ Bulk mode submit ============
  const handleSubmitBulk = async () => {
    const e: Record<string, string> = {};
    if (!form.asset_name.trim()) e.asset_name = "שדה חובה";
    if (!form.category_id) e.category_id = "נא לבחור קטגוריה";
    if (selectedEmployeeIds.length === 0) e.employees = "נא לבחור לפחות עובד אחד";
    if (selectedEmployeeIds.length > 100) e.employees = "ניתן לשייך עד 100 עובדים בפעם אחת";

    // Universal required custom fields validation
    (catFields ?? []).forEach(cf => {
      const key = `cf:${cf.field_name}`;
      const isPerEmp = perEmpFieldKeys.has(key);
      if (cf.is_required && !isPerEmp && !customFields[cf.field_name]) {
        e[`cf_${cf.field_name}`] = "שדה חובה";
      }
    });

    // Universal expiry required if applicable? leave optional like single mode.

    // Per-employee validation
    const codesInForm = new Set<string>();
    const serialsInForm = new Set<string>();
    for (const empId of selectedEmployeeIds) {
      const row = perEmpRows[empId] ?? {};
      const code = row[SYSTEM_FIELD_KEYS.asset_code]?.trim();
      if (!code) {
        e[`row_${empId}`] = "מזהה פריט חסר";
        continue;
      }
      if (codesInForm.has(code)) {
        e[`row_${empId}`] = `מזהה ${code} מופיע פעמיים`;
      }
      codesInForm.add(code);
      if (existingAssets?.some(a => a.asset_code === code)) {
        e[`row_${empId}`] = `מזהה ${code} כבר קיים במערכת`;
      }
      const serial = row[SYSTEM_FIELD_KEYS.serial_number]?.trim();
      if (serial) {
        if (serialsInForm.has(serial)) {
          e[`row_${empId}`] = `מס׳ סידורי ${serial} מופיע פעמיים`;
        }
        serialsInForm.add(serial);
        if (existingAssets?.some(a => a.serial_number === serial)) {
          e[`row_${empId}`] = `מס׳ סידורי ${serial} כבר קיים במערכת`;
        }
      }
      // Required per-emp custom fields
      (catFields ?? []).forEach(cf => {
        const key = `cf:${cf.field_name}`;
        if (cf.is_required && perEmpFieldKeys.has(key)) {
          if (!row[key]?.trim()) {
            e[`row_${empId}`] = `שדה חובה חסר: ${cf.field_name}`;
          }
        }
      });
    }

    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast({ title: "שגיאת ולידציה", description: "נא לתקן את השגיאות המסומנות", variant: "destructive" });
      return;
    }

    // Build rows
    const universalCustom: Record<string, string> = {};
    (catFields ?? []).forEach(cf => {
      const key = `cf:${cf.field_name}`;
      if (!perEmpFieldKeys.has(key) && customFields[cf.field_name]) {
        universalCustom[cf.field_name] = customFields[cf.field_name];
      }
    });

    const expiryIsPerEmp = perEmpFieldKeys.has(SYSTEM_FIELD_KEYS.expiry_date);

    const rows = selectedEmployeeIds.map(empId => {
      const row = perEmpRows[empId] ?? {};
      const perEmpCustom: Record<string, string> = {};
      (catFields ?? []).forEach(cf => {
        const key = `cf:${cf.field_name}`;
        if (perEmpFieldKeys.has(key) && row[key]) {
          perEmpCustom[cf.field_name] = row[key];
        }
      });
      return {
        company_id: activeCompanyId,
        asset_code: row[SYSTEM_FIELD_KEYS.asset_code]!.trim(),
        asset_name: form.asset_name.trim(),
        category_id: form.category_id,
        serial_number: row[SYSTEM_FIELD_KEYS.serial_number]?.trim() || null,
        current_owner_id: empId,
        status: "in_use" as const,
        custom_fields: { ...universalCustom, ...perEmpCustom },
        expiry_date: (expiryIsPerEmp ? row[SYSTEM_FIELD_KEYS.expiry_date] : form.expiry_date) || null,
        notes: form.notes || null,
      };
    });

    setSubmitting(true);
    try {
      const { error } = await supabase.from("assets").insert(rows);
      if (error) throw error;
      toast({
        title: "השיוך הושלם",
        description: `נוצרו ושויכו ${rows.length} פריטים ל-${rows.length} עובדים`,
      });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["asset-categories"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["employee-assets"] });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "שגיאה ביצירת הפריטים", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => (bulkMode ? handleSubmitBulk() : handleSubmitSingle());

  // Universal custom fields list (those NOT per-employee)
  const universalCustomFields = (catFields ?? []).filter(cf => !perEmpFieldKeys.has(`cf:${cf.field_name}`));
  const perEmployeeCustomFields = (catFields ?? []).filter(cf => perEmpFieldKeys.has(`cf:${cf.field_name}`));
  const expiryIsPerEmp = perEmpFieldKeys.has(SYSTEM_FIELD_KEYS.expiry_date);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-h-[90vh] overflow-y-auto", bulkMode ? "max-w-5xl" : "max-w-lg")}
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            הוספת פריט ציוד
          </DialogTitle>
          <DialogDescription>הוסף פריט חדש למלאי הציוד</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {/* Category */}
          <div>
            <label className="text-sm font-medium mb-1 block">קטגוריה<span className="text-destructive mr-1">*</span></label>
            <SearchableSelect
              value={form.category_id}
              onChange={(v) => { set("category_id", v); setCustomFields({}); }}
              options={(categories ?? []).map(c => ({ value: c.id, label: c.category_name }))}
              placeholder="בחר קטגוריה..."
              error={!!errors.category_id}
            />
            {errors.category_id && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.category_id}</p>}
          </div>

          {/* Single mode: asset_code + serial */}
          {!bulkMode && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">מזהה פריט<span className="text-destructive mr-1">*</span></label>
                <input
                  value={form.asset_code}
                  onChange={(e) => set("asset_code", e.target.value)}
                  className={`w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 font-mono ${errors.asset_code ? "ring-2 ring-destructive/50" : "focus:ring-primary/30"}`}
                  dir="ltr"
                />
                {errors.asset_code && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.asset_code}</p>}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">מספר סידורי</label>
                <input
                  value={form.serial_number}
                  onChange={(e) => set("serial_number", e.target.value)}
                  placeholder="SN..."
                  className={`w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 font-mono ${errors.serial_number ? "ring-2 ring-destructive/50" : "focus:ring-primary/30"}`}
                  dir="ltr"
                />
                {errors.serial_number && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.serial_number}</p>}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1 block">שם פריט<span className="text-destructive mr-1">*</span></label>
            <input
              value={form.asset_name}
              onChange={(e) => set("asset_name", e.target.value)}
              placeholder="למשל: MacBook Pro 16"
              className={`w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 ${errors.asset_name ? "ring-2 ring-destructive/50" : "focus:ring-primary/30"}`}
            />
            {errors.asset_name && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.asset_name}</p>}
          </div>

          {/* Single mode: owner + expiry */}
          {!bulkMode && (
            <div className="grid grid-cols-2 gap-3">
              {(selectedCategory as any)?.is_assignable !== false ? (
                <div>
                  <label className="text-sm font-medium mb-1 block">שיוך לעובד</label>
                  <SearchableSelect
                    value={form.current_owner_id}
                    onChange={(v) => set("current_owner_id", v)}
                    options={[
                      { value: "", label: "במלאי (ללא שיוך)" },
                      ...activeEmployees.map(e => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` })),
                    ]}
                    placeholder="במלאי (ללא שיוך)"
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
                  onChange={(e) => set("expiry_date", e.target.value)}
                  className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  dir="ltr"
                />
              </div>
            </div>
          )}

          {/* Bulk mode: universal expiry (only if not per-emp) */}
          {bulkMode && !expiryIsPerEmp && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">תאריך תפוגה</label>
                  <button
                    type="button"
                    onClick={() => togglePerEmpField(SYSTEM_FIELD_KEYS.expiry_date)}
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                    title="הפוך לפר עובד"
                  >
                    <Users className="w-3 h-3" /> פר עובד
                  </button>
                </div>
                <input
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => set("expiry_date", e.target.value)}
                  className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  dir="ltr"
                />
              </div>
            </div>
          )}

          {/* Universal custom fields */}
          {universalCustomFields.length > 0 && (
            <div className="border-t border-border/50 pt-3 mt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {bulkMode ? "שדות אוניברסליים (זהים לכולם)" : "שדות מותאמים לקטגוריה"}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {universalCustomFields.map(cf => {
                  const key = `cf:${cf.field_name}`;
                  const errKey = `cf_${cf.field_name}`;
                  return (
                    <div key={cf.id}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-medium">
                          {cf.field_name}
                          {cf.is_required && <span className="text-destructive mr-1">*</span>}
                        </label>
                        {bulkMode && (
                          <button
                            type="button"
                            onClick={() => togglePerEmpField(key)}
                            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                            title="הפוך לפר עובד"
                          >
                            <Users className="w-3 h-3" /> פר עובד
                          </button>
                        )}
                      </div>
                      {cf.field_type === "list" ? (
                        <SearchableSelect
                          value={customFields[cf.field_name] ?? ""}
                          onChange={(v) => setCustomFields(prev => ({ ...prev, [cf.field_name]: v }))}
                          options={(Array.isArray(cf.field_options) ? cf.field_options : []).map((opt: any) => ({
                            value: String(opt), label: String(opt),
                          }))}
                          placeholder="בחר..."
                          error={!!errors[errKey]}
                        />
                      ) : cf.field_type === "list_multi" ? (
                        (() => {
                          const opts = (Array.isArray(cf.field_options) ? cf.field_options : []).map(String);
                          const cur = customFields[cf.field_name] ?? "";
                          const selected = cur ? cur.split(",").map(s => s.trim()).filter(Boolean) : [];
                          const toggle = (opt: string) => {
                            const next = selected.includes(opt)
                              ? selected.filter(s => s !== opt)
                              : [...selected, opt];
                            setCustomFields(prev => ({ ...prev, [cf.field_name]: next.join(", ") }));
                          };
                          return (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className={cn(
                                    "w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 text-right flex items-center justify-between gap-2 min-h-[40px]",
                                    errors[errKey] ? "ring-2 ring-destructive/50" : "focus:ring-primary/30",
                                  )}
                                >
                                  <span className="flex flex-wrap gap-1 flex-1 min-w-0">
                                    {selected.length === 0 ? (
                                      <span className="text-muted-foreground">בחר אפשרויות...</span>
                                    ) : selected.map(s => (
                                      <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary text-xs">
                                        {s}
                                        <X className="w-3 h-3 cursor-pointer hover:text-destructive" onClick={(e) => { e.stopPropagation(); toggle(s); }} />
                                      </span>
                                    ))}
                                  </span>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[--radix-popover-trigger-width] p-1" align="start">
                                <div className="max-h-64 overflow-auto">
                                  {opts.length === 0 && <p className="text-xs text-muted-foreground p-2 text-center">אין אפשרויות מוגדרות</p>}
                                  {opts.map(opt => (
                                    <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                                      <Checkbox checked={selected.includes(opt)} onCheckedChange={() => toggle(opt)} />
                                      <span>{opt}</span>
                                    </label>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          );
                        })()
                      ) : (
                        <input
                          type={cf.field_type === "number" ? "number" : cf.field_type === "date" ? "date" : "text"}
                          value={customFields[cf.field_name] ?? ""}
                          onChange={(e) => setCustomFields(prev => ({ ...prev, [cf.field_name]: e.target.value }))}
                          className={cn(
                            "w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2",
                            errors[errKey] ? "ring-2 ring-destructive/50" : "focus:ring-primary/30",
                          )}
                          dir={cf.field_type === "date" || cf.field_type === "number" ? "ltr" : "rtl"}
                        />
                      )}
                      {errors[errKey] && <p className="text-xs text-destructive mt-1">{errors[errKey]}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1 block">הערות</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="הערות נוספות..."
              rows={2}
              className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          {/* Pending documents (single mode only) */}
          {!bulkMode && (
            <div
              className={cn(
                "border border-dashed rounded-lg p-3 space-y-2 transition-colors",
                docDragging ? "border-primary bg-primary/5" : "border-border"
              )}
              onDragOver={(e) => { e.preventDefault(); setDocDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDocDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setDocDragging(false);
                const files = Array.from(e.dataTransfer.files ?? []);
                if (files.length > 0) setPendingDocs(prev => [...prev, ...files]);
              }}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  מסמכים מצורפים
                  {pendingDocs.length > 0 && (
                    <span className="text-xs text-muted-foreground font-normal">({pendingDocs.length})</span>
                  )}
                </div>
                <label className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" />
                  בחר קבצים
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length > 0) setPendingDocs(prev => [...prev, ...files]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {pendingDocs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  גרור קבצים לכאן או לחץ "בחר קבצים" — הם יועלו לאחר יצירת הפריט
                </p>
              ) : (
                <ul className="space-y-1">
                  {pendingDocs.map((f, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-2 text-xs bg-muted/40 rounded px-2 py-1">
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setPendingDocs(prev => prev.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ============ BULK MODE TOGGLE ============ */}
          {/* Hidden for institutional categories — they cannot be assigned to employees */}
          {(selectedCategory as any)?.is_assignable !== false && (
            <>
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border/50 mt-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">שייך פריט לקבוצת עובדים</p>
                    <p className="text-xs text-muted-foreground">צור עותק של הפריט לכל עובד נבחר עם פרטים אישיים</p>
                  </div>
                </div>
                <Switch
                  checked={bulkMode}
                  onCheckedChange={(v) => {
                    if (!v && selectedEmployeeIds.length > 1) {
                      if (!confirm("ביטול השיוך הקבוצתי ימחק את הפרטים שמולאו לעובדים. להמשיך?")) return;
                    }
                    setBulkMode(v);
                    if (!v) {
                      // Keep first employee as single owner
                      if (selectedEmployeeIds[0]) {
                        setForm(prev => ({ ...prev, current_owner_id: selectedEmployeeIds[0] }));
                      }
                      setSelectedEmployeeIds([]);
                      setPerEmpRows({});
                    }
                  }}
                  disabled={!form.category_id}
                />
              </div>
              {!form.category_id && bulkMode === false && (
                <p className="text-xs text-muted-foreground">בחר קטגוריה לפני הפעלת השיוך הקבוצתי</p>
              )}
            </>
          )}

          {/* ============ BULK MODE UI ============ */}
          {bulkMode && (
            <div className="space-y-3 border-t border-border/50 pt-4">
              {/* Employee picker */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">בחר עובדים</label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">נבחרו: {selectedEmployeeIds.length}</span>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllVisible}>
                      בחר הכל בתוצאות
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>
                      <X className="w-3 h-3" /> נקה
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_200px] gap-2 mb-2">
                  <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <input
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                      placeholder="חיפוש עובד..."
                      className="bg-transparent text-sm outline-none w-full"
                    />
                  </div>
                  <SearchableSelect
                    value={empDeptFilter}
                    onChange={setEmpDeptFilter}
                    options={[{ value: "", label: "כל המחלקות" }, ...departments.map(d => ({ value: d, label: d }))]}
                    placeholder="כל המחלקות"
                  />
                </div>

                <div className="border border-border rounded-lg max-h-48 overflow-y-auto">
                  {filteredEmployees.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">לא נמצאו עובדים</div>
                  ) : (
                    filteredEmployees.map(e => {
                      const checked = selectedEmployeeIds.includes(e.id);
                      return (
                        <label
                          key={e.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b border-border/30 last:border-0"
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleEmployee(e.id)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{e.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{e.department} · {e.employee_code}</p>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
                {errors.employees && <p className="text-xs text-destructive mt-1">{errors.employees}</p>}
              </div>

              {/* Per-employee fields table */}
              {selectedEmployeeIds.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">שדות פר עובד</p>
                  <div className="border border-border rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-right p-2 font-medium sticky right-0 bg-muted/40 z-10 min-w-[160px]">עובד</th>
                          <th className="text-right p-2 font-medium min-w-[140px]">
                            <div className="flex items-center justify-between gap-1">
                              <span>מזהה פריט</span>
                              <button type="button" onClick={() => copyToAll(SYSTEM_FIELD_KEYS.asset_code)}
                                className="text-muted-foreground hover:text-primary" title="העתק לכולם">
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </th>
                          <th className="text-right p-2 font-medium min-w-[140px]">
                            <div className="flex items-center justify-between gap-1">
                              <span>מס׳ סידורי</span>
                              <button type="button" onClick={() => copyToAll(SYSTEM_FIELD_KEYS.serial_number)}
                                className="text-muted-foreground hover:text-primary" title="העתק לכולם">
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </th>
                          {expiryIsPerEmp && (
                            <th className="text-right p-2 font-medium min-w-[160px]">
                              <div className="flex items-center justify-between gap-1">
                                <span>תאריך תפוגה</span>
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => copyToAll(SYSTEM_FIELD_KEYS.expiry_date)}
                                    className="text-muted-foreground hover:text-primary" title="העתק לכולם">
                                    <Copy className="w-3 h-3" />
                                  </button>
                                  <button type="button" onClick={() => togglePerEmpField(SYSTEM_FIELD_KEYS.expiry_date)}
                                    className="text-muted-foreground hover:text-primary" title="הפוך לאוניברסלי">
                                    <User className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </th>
                          )}
                          {perEmployeeCustomFields.map(cf => (
                            <th key={cf.id} className="text-right p-2 font-medium min-w-[140px]">
                              <div className="flex items-center justify-between gap-1">
                                <span>
                                  {cf.field_name}
                                  {cf.is_required && <span className="text-destructive mr-1">*</span>}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => copyToAll(`cf:${cf.field_name}`)}
                                    className="text-muted-foreground hover:text-primary" title="העתק לכולם">
                                    <Copy className="w-3 h-3" />
                                  </button>
                                  <button type="button" onClick={() => togglePerEmpField(`cf:${cf.field_name}`)}
                                    className="text-muted-foreground hover:text-primary" title="הפוך לאוניברסלי">
                                    <User className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedEmployeeIds.map(empId => {
                          const emp = activeEmployees.find(e => e.id === empId);
                          if (!emp) return null;
                          const row = perEmpRows[empId] ?? {};
                          const rowError = errors[`row_${empId}`];
                          return (
                            <tr key={empId} className={cn("border-t border-border/30", rowError && "bg-destructive/5")}>
                              <td className="p-2 sticky right-0 bg-background z-10">
                                <div className="font-medium truncate">{emp.full_name}</div>
                                <div className="text-xs text-muted-foreground truncate">{emp.employee_code}</div>
                                {rowError && (
                                  <div className="text-xs text-destructive flex items-center gap-1 mt-1">
                                    <AlertCircle className="w-3 h-3" /> {rowError}
                                  </div>
                                )}
                              </td>
                              <td className="p-2">
                                <input
                                  value={row[SYSTEM_FIELD_KEYS.asset_code] ?? ""}
                                  onChange={(e) => setPerEmpValue(empId, SYSTEM_FIELD_KEYS.asset_code, e.target.value)}
                                  className="w-full px-2 py-1 bg-muted rounded text-xs font-mono outline-none focus:ring-2 focus:ring-primary/30"
                                  dir="ltr"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  value={row[SYSTEM_FIELD_KEYS.serial_number] ?? ""}
                                  onChange={(e) => setPerEmpValue(empId, SYSTEM_FIELD_KEYS.serial_number, e.target.value)}
                                  placeholder="SN..."
                                  className="w-full px-2 py-1 bg-muted rounded text-xs font-mono outline-none focus:ring-2 focus:ring-primary/30"
                                  dir="ltr"
                                />
                              </td>
                              {expiryIsPerEmp && (
                                <td className="p-2">
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" size="sm" className="w-full justify-start font-normal h-8 text-xs">
                                        <CalendarIcon className="w-3 h-3 ml-1" />
                                        {row[SYSTEM_FIELD_KEYS.expiry_date]
                                          ? format(new Date(row[SYSTEM_FIELD_KEYS.expiry_date]), "dd/MM/yyyy")
                                          : "בחר תאריך"}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <Calendar
                                        mode="single"
                                        selected={row[SYSTEM_FIELD_KEYS.expiry_date] ? new Date(row[SYSTEM_FIELD_KEYS.expiry_date]) : undefined}
                                        onSelect={(d) => setPerEmpValue(empId, SYSTEM_FIELD_KEYS.expiry_date, d ? format(d, "yyyy-MM-dd") : "")}
                                        initialFocus
                                        className={cn("p-3 pointer-events-auto")}
                                      />
                                    </PopoverContent>
                                  </Popover>
                                </td>
                              )}
                              {perEmployeeCustomFields.map(cf => {
                                const key = `cf:${cf.field_name}`;
                                if (cf.field_type === "date") {
                                  return (
                                    <td key={cf.id} className="p-2">
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button variant="outline" size="sm" className="w-full justify-start font-normal h-8 text-xs">
                                            <CalendarIcon className="w-3 h-3 ml-1" />
                                            {row[key] ? format(new Date(row[key]), "dd/MM/yyyy") : "בחר תאריך"}
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                          <Calendar
                                            mode="single"
                                            selected={row[key] ? new Date(row[key]) : undefined}
                                            onSelect={(d) => setPerEmpValue(empId, key, d ? format(d, "yyyy-MM-dd") : "")}
                                            initialFocus
                                            className={cn("p-3 pointer-events-auto")}
                                          />
                                        </PopoverContent>
                                      </Popover>
                                    </td>
                                  );
                                }
                                if (cf.field_type === "list") {
                                  return (
                                    <td key={cf.id} className="p-2">
                                      <SearchableSelect
                                        value={row[key] ?? ""}
                                        onChange={(v) => setPerEmpValue(empId, key, v)}
                                        options={(Array.isArray(cf.field_options) ? cf.field_options : []).map((opt: any) => ({
                                          value: String(opt), label: String(opt),
                                        }))}
                                        placeholder="בחר..."
                                      />
                                    </td>
                                  );
                                }
                                return (
                                  <td key={cf.id} className="p-2">
                                    <input
                                      type={cf.field_type === "number" ? "number" : "text"}
                                      value={row[key] ?? ""}
                                      onChange={(e) => setPerEmpValue(empId, key, e.target.value)}
                                      className="w-full px-2 py-1 bg-muted rounded text-xs outline-none focus:ring-2 focus:ring-primary/30"
                                      dir={cf.field_type === "number" ? "ltr" : "rtl"}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={mutation.isPending || submitting || (bulkMode && selectedEmployeeIds.length === 0)}
            >
              {(mutation.isPending || submitting)
                ? "שומר..."
                : bulkMode
                  ? `הוסף ${selectedEmployeeIds.length || ""} פריטים ושייך`
                  : "הוסף פריט"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

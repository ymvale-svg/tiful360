import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Package, AlertCircle } from "lucide-react";
import { useCreateAsset } from "@/hooks/useMutations";
import { useAssetCategories, useEmployees, useAssets } from "@/hooks/useData";
import { useCategoryFields } from "@/hooks/useCategories";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddAssetDialog({ open, onOpenChange }: Props) {
  const { data: categories } = useAssetCategories();
  const { data: employees } = useEmployees();
  const { data: existingAssets } = useAssets();
  const mutation = useCreateAsset();
  const { toast } = useToast();
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const { data: catFields } = useCategoryFields(form.category_id);

  // Auto-generate asset code when category changes
  useEffect(() => {
    if (form.category_id && categories) {
      const cat = categories.find(c => c.id === form.category_id);
      if (cat) {
        const count = (cat as any).assets?.[0]?.count ?? 0;
        setForm(prev => ({
          ...prev,
          asset_code: `${cat.prefix}-${String(count + 1).padStart(3, "0")}`,
        }));
      }
    }
  }, [form.category_id, categories]);

  // Auto-set status based on owner
  useEffect(() => {
    if (form.current_owner_id) {
      setForm(prev => ({ ...prev, status: "in_use" }));
    }
  }, [form.current_owner_id]);

  const set = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const handleSubmit = async () => {
    const e: Record<string, string> = {};
    if (!form.asset_code.trim()) e.asset_code = "שדה חובה";
    else if (existingAssets?.some(a => a.asset_code === form.asset_code))
      e.asset_code = "מזהה פריט כבר קיים במערכת";
    if (!form.asset_name.trim()) e.asset_name = "שדה חובה";
    if (!form.category_id) e.category_id = "נא לבחור קטגוריה";
    if (form.serial_number && existingAssets?.some(a => a.serial_number === form.serial_number))
      e.serial_number = "מספר סידורי כבר קיים במערכת";

    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast({ title: "שגיאת ולידציה", description: "נא לתקן את השגיאות המסומנות", variant: "destructive" });
      return;
    }
    try {
      await mutation.mutateAsync({
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
      toast({ title: "פריט ציוד נוסף בהצלחה" });
      onOpenChange(false);
      setForm({
        asset_code: "", asset_name: "", category_id: "", serial_number: "",
        current_owner_id: "", status: "in_stock", expiry_date: "", notes: "",
      });
      setCustomFields({});
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
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
            <select
              value={form.category_id}
              onChange={(e) => { set("category_id", e.target.value); setCustomFields({}); }}
              className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">בחר קטגוריה...</option>
              {(categories ?? []).map(c => (
                <option key={c.id} value={c.id}>{c.category_name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">מזהה פריט<span className="text-destructive mr-1">*</span></label>
              <input
                value={form.asset_code}
                onChange={(e) => set("asset_code", e.target.value)}
                className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">מספר סידורי</label>
              <input
                value={form.serial_number}
                onChange={(e) => set("serial_number", e.target.value)}
                placeholder="SN..."
                className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">שם פריט<span className="text-destructive mr-1">*</span></label>
            <input
              value={form.asset_name}
              onChange={(e) => set("asset_name", e.target.value)}
              placeholder="למשל: MacBook Pro 16"
              className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">שיוך לעובד</label>
              <select
                value={form.current_owner_id}
                onChange={(e) => set("current_owner_id", e.target.value)}
                className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">במלאי (ללא שיוך)</option>
                {(employees ?? []).filter(e => e.status === "active" || e.status === "onboarding").map(e => (
                  <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
                ))}
              </select>
            </div>
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

          {/* Dynamic category fields */}
          {catFields && catFields.length > 0 && (
            <div className="border-t border-border/50 pt-3 mt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">שדות מותאמים לקטגוריה</p>
              <div className="grid grid-cols-2 gap-3">
                {catFields.map(cf => (
                  <div key={cf.id}>
                    <label className="text-sm font-medium mb-1 block">
                      {cf.field_name}
                      {cf.is_required && <span className="text-destructive mr-1">*</span>}
                    </label>
                    {cf.field_type === "list" ? (
                      <select
                        value={customFields[cf.field_name] ?? ""}
                        onChange={(e) => setCustomFields(prev => ({ ...prev, [cf.field_name]: e.target.value }))}
                        className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">בחר...</option>
                        {(Array.isArray(cf.field_options) ? cf.field_options : []).map((opt: any, i: number) => (
                          <option key={i} value={String(opt)}>{String(opt)}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={cf.field_type === "number" ? "number" : cf.field_type === "date" ? "date" : "text"}
                        value={customFields[cf.field_name] ?? ""}
                        onChange={(e) => setCustomFields(prev => ({ ...prev, [cf.field_name]: e.target.value }))}
                        className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        dir={cf.field_type === "date" || cf.field_type === "number" ? "ltr" : "rtl"}
                      />
                    )}
                  </div>
                ))}
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

          <div className="flex gap-3 pt-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={mutation.isPending}>
              {mutation.isPending ? "שומר..." : "הוסף פריט"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

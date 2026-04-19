import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Package, FileSignature } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAssetCategories, useEmployees } from "@/hooks/useData";
import { useUpdateAsset } from "@/hooks/useMutations";
import { useToast } from "@/hooks/use-toast";
import { AssignAssetWithFormDialog } from "./AssignAssetWithFormDialog";

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

          <div className="grid grid-cols-2 gap-3">
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
    </Dialog>
  );
}

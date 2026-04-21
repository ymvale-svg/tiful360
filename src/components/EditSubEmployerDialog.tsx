import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUpdateSubEmployer, SubEmployer } from "@/hooks/useSubEmployers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subEmployer: SubEmployer | null;
}

export function EditSubEmployerDialog({ open, onOpenChange, subEmployer }: Props) {
  const { toast } = useToast();
  const update = useUpdateSubEmployer();
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (subEmployer) {
      setForm({
        legal_name: subEmployer.legal_name ?? "",
        tax_id: subEmployer.tax_id ?? "",
        address: subEmployer.address ?? "",
        city: subEmployer.city ?? "",
        postal_code: subEmployer.postal_code ?? "",
        phone: subEmployer.phone ?? "",
        email: subEmployer.email ?? "",
        withholding_file_number: subEmployer.withholding_file_number ?? "",
        contact_name: subEmployer.contact_name ?? "",
        is_active: subEmployer.is_active,
      });
    }
  }, [subEmployer, open]);

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!subEmployer) return;
    if (!form.legal_name?.trim() || !form.tax_id?.trim()) {
      toast({ title: "חסרים שדות", description: "שם משפטי וח.פ. הם חובה", variant: "destructive" });
      return;
    }
    try {
      await update.mutateAsync({ id: subEmployer.id, ...form });
      toast({ title: "השינויים נשמרו" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            עריכת תת-חברה
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          <div>
            <Label>שם משפטי <span className="text-destructive">*</span></Label>
            <Input value={form.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value)} />
          </div>
          <div>
            <Label>ח.פ. / מספר עוסק <span className="text-destructive">*</span></Label>
            <Input value={form.tax_id ?? ""} onChange={(e) => set("tax_id", e.target.value)} dir="ltr" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>כתובת</Label>
              <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div>
              <Label>עיר</Label>
              <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <Label>מיקוד</Label>
              <Input value={form.postal_code ?? ""} onChange={(e) => set("postal_code", e.target.value)} dir="ltr" />
            </div>
            <div>
              <Label>טלפון</Label>
              <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} dir="ltr" />
            </div>
            <div className="col-span-2">
              <Label>מייל</Label>
              <Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} dir="ltr" />
            </div>
            <div>
              <Label>מספר תיק ניכויים</Label>
              <Input value={form.withholding_file_number ?? ""} onChange={(e) => set("withholding_file_number", e.target.value)} dir="ltr" />
            </div>
            <div>
              <Label>איש קשר</Label>
              <Input value={form.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between border border-border/50 rounded-lg p-3 bg-muted/30">
            <Label className="cursor-pointer">תת-חברה פעילה</Label>
            <Switch checked={!!form.is_active} onCheckedChange={(v) => set("is_active", v)} />
          </div>

          <div className="flex gap-2 pt-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button className="flex-1" onClick={handleSave} disabled={update.isPending}>
              {update.isPending ? "שומר..." : "שמור"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

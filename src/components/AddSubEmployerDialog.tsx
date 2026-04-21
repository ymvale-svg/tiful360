import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCreateSubEmployer } from "@/hooks/useSubEmployers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const empty = {
  legal_name: "",
  tax_id: "",
  address: "",
  city: "",
  postal_code: "",
  phone: "",
  email: "",
  withholding_file_number: "",
  contact_name: "",
};

export function AddSubEmployerDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const create = useCreateSubEmployer();
  const [form, setForm] = useState(empty);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.legal_name.trim() || !form.tax_id.trim()) {
      toast({ title: "חסרים שדות", description: "שם משפטי וח.פ./מספר עוסק הם חובה", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync(form as any);
      toast({ title: "תת-חברה נוספה בהצלחה" });
      setForm(empty);
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
            הוספת תת-חברה
          </DialogTitle>
          <DialogDescription>
            תת-חברה משמשת לטופס 101 של עובדים שמועסקים תחת ישות משפטית שונה
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          <div>
            <Label>שם משפטי <span className="text-destructive">*</span></Label>
            <Input value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} />
          </div>
          <div>
            <Label>ח.פ. / מספר עוסק <span className="text-destructive">*</span></Label>
            <Input value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} dir="ltr" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>כתובת</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div>
              <Label>עיר</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <Label>מיקוד</Label>
              <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} dir="ltr" />
            </div>
            <div>
              <Label>טלפון</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} dir="ltr" />
            </div>
            <div className="col-span-2">
              <Label>מייל</Label>
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} dir="ltr" />
            </div>
            <div>
              <Label>מספר תיק ניכויים</Label>
              <Input value={form.withholding_file_number} onChange={(e) => set("withholding_file_number", e.target.value)} dir="ltr" />
            </div>
            <div>
              <Label>איש קשר</Label>
              <Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={create.isPending}>
              {create.isPending ? "שומר..." : "הוסף"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

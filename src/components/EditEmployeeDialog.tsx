import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateEmployee } from "@/hooks/useMutations";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: any;
}

export function EditEmployeeDialog({ open, onOpenChange, employee }: Props) {
  const { toast } = useToast();
  const update = useUpdateEmployee();
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (employee) {
      setForm({
        full_name: employee.full_name ?? "",
        employee_code: employee.employee_code ?? "",
        id_number: employee.id_number ?? "",
        department: employee.department ?? "",
        role: employee.role ?? "",
        email: employee.email ?? "",
        phone: employee.phone ?? "",
        birth_date: employee.birth_date ?? "",
        start_date: employee.start_date ?? "",
        status: employee.status ?? "active",
      });
    }
  }, [employee, open]);

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    try {
      const payload = { ...form };
      if (!payload.birth_date) delete payload.birth_date;
      if (!payload.email) delete payload.email;
      if (!payload.phone) delete payload.phone;
      await update.mutateAsync({ id: employee.id, ...payload });
      toast({ title: "פרטי העובד נשמרו" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>עריכת פרטי עובד</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div>
            <Label>שם מלא</Label>
            <Input value={form.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <div>
            <Label>מספר עובד</Label>
            <Input value={form.employee_code ?? ""} onChange={(e) => set("employee_code", e.target.value)} />
          </div>
          <div>
            <Label>תעודת זהות</Label>
            <Input value={form.id_number ?? ""} onChange={(e) => set("id_number", e.target.value)} />
          </div>
          <div>
            <Label>מחלקה</Label>
            <Input value={form.department ?? ""} onChange={(e) => set("department", e.target.value)} />
          </div>
          <div>
            <Label>תפקיד</Label>
            <Input value={form.role ?? ""} onChange={(e) => set("role", e.target.value)} />
          </div>
          <div>
            <Label>אימייל</Label>
            <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <Label>טלפון</Label>
            <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <Label>תאריך לידה</Label>
            <Input type="date" value={form.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value)} />
          </div>
          <div>
            <Label>תאריך תחילת עבודה</Label>
            <Input type="date" value={form.start_date ?? ""} onChange={(e) => set("start_date", e.target.value)} />
          </div>
          <div>
            <Label>סטטוס</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">פעיל</SelectItem>
                <SelectItem value="onboarding">בקליטה</SelectItem>
                <SelectItem value="leaving">בעזיבה</SelectItem>
                <SelectItem value="inactive">לא פעיל</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2 pt-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button className="flex-1" disabled={update.isPending} onClick={handleSave}>
            {update.isPending ? "שומר..." : "שמור"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

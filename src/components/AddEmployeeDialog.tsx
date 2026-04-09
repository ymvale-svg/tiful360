import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import { useCreateEmployee } from "@/hooks/useMutations";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddEmployeeDialog({ open, onOpenChange }: Props) {
  const [form, setForm] = useState({
    employee_code: "",
    full_name: "",
    id_number: "",
    role: "",
    department: "",
    phone: "",
    email: "",
    start_date: new Date().toISOString().split("T")[0],
    status: "active" as "active" | "onboarding",
  });
  const mutation = useCreateEmployee();
  const { toast } = useToast();

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.full_name || !form.id_number || !form.role || !form.department || !form.employee_code) {
      toast({ title: "שגיאה", description: "נא למלא את כל שדות החובה", variant: "destructive" });
      return;
    }
    try {
      await mutation.mutateAsync({
        ...form,
        phone: form.phone || undefined,
        email: form.email || undefined,
      });
      toast({ title: "עובד נוסף בהצלחה" });
      onOpenChange(false);
      setForm({
        employee_code: "", full_name: "", id_number: "", role: "",
        department: "", phone: "", email: "",
        start_date: new Date().toISOString().split("T")[0], status: "active",
      });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  const fields = [
    { key: "employee_code", label: "מזהה עובד", placeholder: "EMP-009", required: true, dir: "ltr" as const },
    { key: "full_name", label: "שם מלא", placeholder: "ישראל ישראלי", required: true },
    { key: "id_number", label: "תעודת זהות", placeholder: "123456789", required: true, dir: "ltr" as const },
    { key: "role", label: "תפקיד", placeholder: "מהנדס בניין", required: true },
    { key: "department", label: "מחלקה", placeholder: "הנדסה", required: true },
    { key: "phone", label: "טלפון", placeholder: "050-1234567", dir: "ltr" as const },
    { key: "email", label: 'דוא"ל', placeholder: "user@company.co.il", dir: "ltr" as const },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            הוספת עובד חדש
          </DialogTitle>
          <DialogDescription>מלא את פרטי העובד החדש</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="text-sm font-medium mb-1 block">
                {f.label}{f.required && <span className="text-destructive mr-1">*</span>}
              </label>
              <input
                value={(form as any)[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                dir={f.dir}
                className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">תאריך התחלה</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">סטטוס</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="active">פעיל</option>
                <option value="onboarding">בקליטה</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={mutation.isPending}>
              {mutation.isPending ? "שומר..." : "הוסף עובד"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

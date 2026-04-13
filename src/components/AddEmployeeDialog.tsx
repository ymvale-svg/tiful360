import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus, AlertCircle } from "lucide-react";
import { useCreateEmployee } from "@/hooks/useMutations";
import { useEmployees } from "@/hooks/useData";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Israeli ID (Mispar Zehut) validation with Luhn-like check digit
function isValidIsraeliId(id: string): boolean {
  const trimmed = id.replace(/\D/g, "");
  if (trimmed.length < 5 || trimmed.length > 9) return false;
  const padded = trimmed.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(padded[i], 10) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
}

function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return /^(\+972|0)(5\d)\d{7}$/.test(cleaned) || /^\+?\d{7,15}$/.test(cleaned);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function isValidEmployeeCode(code: string): boolean {
  return /^[A-Za-z]{2,5}-\d{2,5}$/.test(code);
}

type FieldErrors = Record<string, string>;

export function AddEmployeeDialog({ open, onOpenChange }: Props) {
  const [form, setForm] = useState({
    employee_code: "",
    full_name: "",
    id_number: "",
    role: "",
    department: "",
    phone: "",
    email: "",
    birth_date: "",
    start_date: new Date().toISOString().split("T")[0],
    status: "active" as "active" | "onboarding",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useCreateEmployee();
  const { data: existingEmployees } = useEmployees();
  const { toast } = useToast();

  const set = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    // Clear error on change
    setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!form.employee_code.trim()) e.employee_code = "שדה חובה";
    else if (!isValidEmployeeCode(form.employee_code)) e.employee_code = "פורמט: ABC-001";
    else if (existingEmployees?.some(emp => emp.employee_code === form.employee_code))
      e.employee_code = "מזהה כבר קיים במערכת";

    if (!form.full_name.trim()) e.full_name = "שדה חובה";
    else if (form.full_name.trim().length < 2) e.full_name = "שם קצר מדי";

    if (!form.id_number.trim()) e.id_number = "שדה חובה";
    else if (!isValidIsraeliId(form.id_number)) e.id_number = "תעודת זהות לא תקינה (ספרת ביקורת)";
    else if (existingEmployees?.some(emp => emp.id_number === form.id_number))
      e.id_number = "ת.ז כבר קיימת במערכת";

    if (!form.role.trim()) e.role = "שדה חובה";
    if (!form.department.trim()) e.department = "שדה חובה";

    if (form.phone && !isValidPhone(form.phone)) e.phone = "פורמט טלפון לא תקין";
    if (form.email && !isValidEmail(form.email)) e.email = "כתובת דוא\"ל לא תקינה";
    if (form.email && existingEmployees?.some(emp => emp.email === form.email))
      e.email = "דוא\"ל כבר קיים במערכת";

    return e;
  };

  const handleSubmit = async () => {
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      toast({ title: "שגיאת ולידציה", description: "נא לתקן את השגיאות המסומנות", variant: "destructive" });
      return;
    }
    try {
      await mutation.mutateAsync({
        ...form,
        phone: form.phone || undefined,
        email: form.email || undefined,
        birth_date: form.birth_date || undefined,
      });
      toast({ title: "עובד נוסף בהצלחה" });
      onOpenChange(false);
      setForm({
        employee_code: "", full_name: "", id_number: "", role: "",
        department: "", phone: "", email: "", birth_date: "",
        start_date: new Date().toISOString().split("T")[0], status: "active",
      });
      setErrors({});
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
                className={`w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 transition-all ${
                  errors[f.key] ? "ring-2 ring-destructive/50 focus:ring-destructive/50" : "focus:ring-primary/30"
                }`}
              />
              {errors[f.key] && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors[f.key]}
                </p>
              )}
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">תאריך לידה</label>
              <input
                type="date"
                value={form.birth_date}
                onChange={(e) => set("birth_date", e.target.value)}
                className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                dir="ltr"
              />
            </div>
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

import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus, AlertCircle, Mail, EyeOff } from "lucide-react";
import { useCreateEmployee } from "@/hooks/useMutations";
import { useEmployees } from "@/hooks/useData";
import { useToast } from "@/hooks/use-toast";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { useSubEmployers } from "@/hooks/useSubEmployers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

const ALL_ROLES: { value: AppRole; label: string }[] = [
  { value: "employee", label: "עובד" },
  { value: "direct_manager", label: "מנהל ישיר" },
  { value: "it_manager", label: "מנהל IT" },
  { value: "operations", label: "תפעול" },
  { value: "payroll", label: "שכר" },
  { value: "admin", label: "מנהל מערכת" },
  { value: "super_admin", label: "סופר אדמין" },
];

const OPERATIONS_BLOCKED: AppRole[] = ["admin", "payroll", "super_admin"];

type FieldErrors = Record<string, string>;

export function AddEmployeeDialog({ open, onOpenChange }: Props) {
  const [form, setForm] = useState({
    employee_number: "",
    full_name: "",
    id_number: "",
    role: "",
    department: "",
    direct_manager_id: "",
    sub_employer_id: "",
    phone: "",
    email: "",
    birth_date: "",
    start_date: new Date().toISOString().split("T")[0],
    status: "active" as "active" | "onboarding",
    system_role: "employee" as AppRole,
    send_invite: true,
    exclude_from_contacts: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useCreateEmployee();
  const { data: existingEmployees } = useEmployees();
  const { toast } = useToast();
  const { isOperations, isAdmin, isSuperAdmin, isHR, isPayroll } = useAuth();
  const { activeCompanyId, activeCompany } = useCompany();
  const { data: subEmployers = [] } = useSubEmployers(true);

  const set = (key: string, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    existingEmployees?.forEach(e => e.department && set.add(e.department));
    return Array.from(set).sort().map(v => ({ value: v, label: v }));
  }, [existingEmployees]);

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    existingEmployees?.forEach(e => e.role && set.add(e.role));
    return Array.from(set).sort().map(v => ({ value: v, label: v }));
  }, [existingEmployees]);

  const managerOptions = useMemo(() => {
    return (existingEmployees ?? [])
      .map(e => ({ value: e.id!, label: `${e.full_name} (${e.role ?? ""})` }));
  }, [existingEmployees]);

  // Operations users cannot grant elevated roles (unless they're also admin/super_admin)
  const allowedSystemRoles = useMemo(() => {
    if (isAdmin || isSuperAdmin) return ALL_ROLES.filter(r => r.value !== "super_admin" || isSuperAdmin);
    if (isOperations) return ALL_ROLES.filter(r => !OPERATIONS_BLOCKED.includes(r.value));
    return ALL_ROLES.filter(r => r.value === "employee");
  }, [isAdmin, isSuperAdmin, isOperations]);

  const fullEmployeeCode = form.employee_number.trim() ? `EMP-${form.employee_number.trim()}` : "";

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!form.employee_number.trim()) e.employee_number = "שדה חובה";
    else if (!/^\d{1,6}$/.test(form.employee_number.trim())) e.employee_number = "ספרות בלבד (עד 6)";
    else if (existingEmployees?.some(emp => emp.employee_code === fullEmployeeCode))
      e.employee_number = "מזהה כבר קיים במערכת";

    if (!form.full_name.trim()) e.full_name = "שדה חובה";
    else if (form.full_name.trim().length < 2) e.full_name = "שם קצר מדי";

    if (!form.id_number.trim()) e.id_number = "שדה חובה";
    else if (!isValidIsraeliId(form.id_number)) e.id_number = "תעודת זהות לא תקינה";

    if (!form.role.trim()) e.role = "שדה חובה";
    if (!form.department.trim()) e.department = "שדה חובה";

    if (!form.email.trim()) e.email = "שדה חובה (נדרש לצורך גישה למערכת)";
    else if (!isValidEmail(form.email)) e.email = "כתובת דוא\"ל לא תקינה";

    if (form.phone && !isValidPhone(form.phone)) e.phone = "פורמט טלפון לא תקין";

    if (isOperations && !isAdmin && !isSuperAdmin && OPERATIONS_BLOCKED.includes(form.system_role)) {
      e.system_role = "אין לך הרשאה לתפקיד זה";
    }

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
      const created = await mutation.mutateAsync({
        employee_code: fullEmployeeCode,
        full_name: form.full_name,
        id_number: form.id_number,
        role: form.role,
        department: form.department,
        phone: form.phone || undefined,
        email: form.email,
        birth_date: form.birth_date || undefined,
        start_date: form.start_date,
        status: form.status,
        direct_manager_id: form.direct_manager_id || null,
        sub_employer_id: form.sub_employer_id || null,
        exclude_from_contacts: form.exclude_from_contacts,
      } as any);

      toast({ title: "עובד נוסף בהצלחה" });

      // Send invitation in background if requested
      if (form.send_invite && activeCompanyId && created?.id) {
        try {
          const { data: inviteResult, error: inviteErr } = await supabase.functions.invoke("manage-users?action=invite", {
            body: {
              company_id: activeCompanyId,
              role: form.system_role,
              employees: [{ employee_id: created.id, email: form.email, full_name: form.full_name }],
            },
          });
          if (inviteErr) throw inviteErr;
          const r = inviteResult?.results?.[0];
          if (r?.status === "invited") {
            toast({ title: "הזמנה נשלחה", description: `מייל הזמנה נשלח אל ${form.email}` });
          } else if (r?.status === "already_exists") {
            toast({ title: "המשתמש כבר קיים", description: "החשבון קושר לעובד" });
          } else if (r?.status === "failed") {
            toast({ title: "שליחת הזמנה נכשלה", description: r.error || "ניתן לנסות שוב מ\"ערוך עובד\"", variant: "destructive" });
          }
        } catch (inviteErr: any) {
          toast({
            title: "שליחת הזמנה נכשלה",
            description: `${inviteErr.message || "שגיאה"} — העובד נוצר, ניתן לשלוח הזמנה ידנית`,
            variant: "destructive",
          });
        }
      }

      onOpenChange(false);
      setForm({
        employee_number: "", full_name: "", id_number: "", role: "",
        department: "", direct_manager_id: "", sub_employer_id: "", phone: "", email: "", birth_date: "",
        start_date: new Date().toISOString().split("T")[0], status: "active",
        system_role: "employee", send_invite: true, exclude_from_contacts: false,
      });
      setErrors({});
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  const inputCls = (k: string) =>
    `w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 transition-all ${
      errors[k] ? "ring-2 ring-destructive/50 focus:ring-destructive/50" : "focus:ring-primary/30"
    }`;

  const errMsg = (k: string) => errors[k] && (
    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
      <AlertCircle className="w-3 h-3" />
      {errors[k]}
    </p>
  );

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
          <div>
            <label className="text-sm font-medium mb-1 block">
              מס' עובד<span className="text-destructive mr-1">*</span>
            </label>
            <div className="flex gap-2 items-center" dir="ltr">
              <span className="px-3 py-2 bg-muted/60 rounded-lg text-sm font-mono text-muted-foreground select-none">EMP-</span>
              <input
                value={form.employee_number}
                onChange={(e) => set("employee_number", e.target.value.replace(/\D/g, ""))}
                placeholder="009"
                inputMode="numeric"
                dir="ltr"
                className={`flex-1 ${inputCls("employee_number")}`}
              />
            </div>
            {errMsg("employee_number")}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">שם מלא<span className="text-destructive mr-1">*</span></label>
            <input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="ישראל ישראלי" className={inputCls("full_name")} />
            {errMsg("full_name")}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">תעודת זהות<span className="text-destructive mr-1">*</span></label>
            <input value={form.id_number} onChange={(e) => set("id_number", e.target.value)} placeholder="123456789" dir="ltr" className={inputCls("id_number")} />
            {errMsg("id_number")}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">תפקיד<span className="text-destructive mr-1">*</span></label>
            <SearchableSelect
              value={form.role}
              onChange={(v) => set("role", v)}
              options={roleOptions}
              placeholder="בחר או הוסף תפקיד"
              searchPlaceholder="חפש או הקלד תפקיד חדש..."
              allowCreate
              error={!!errors.role}
            />
            {errMsg("role")}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">מחלקה<span className="text-destructive mr-1">*</span></label>
            <SearchableSelect
              value={form.department}
              onChange={(v) => set("department", v)}
              options={departmentOptions}
              placeholder="בחר או הוסף מחלקה"
              searchPlaceholder="חפש או הקלד מחלקה חדשה..."
              allowCreate
              error={!!errors.department}
            />
            {errMsg("department")}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">מנהל ישיר</label>
            <SearchableSelect
              value={form.direct_manager_id}
              onChange={(v) => set("direct_manager_id", v)}
              options={[{ value: "", label: "ללא" }, ...managerOptions]}
              placeholder="בחר מנהל ישיר (אופציונלי)"
              searchPlaceholder="חפש עובד..."
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">מעסיק</label>
            <SearchableSelect
              value={form.sub_employer_id}
              onChange={(v) => set("sub_employer_id", v)}
              options={[
                { value: "", label: `החברה הראשית — ${activeCompany?.name ?? ""}` },
                ...subEmployers.map((s) => ({ value: s.id, label: `${s.legal_name} (${s.tax_id})` })),
              ]}
              placeholder="החברה הראשית"
              searchPlaceholder="חפש מעסיק..."
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              קובע באיזה ישות משפטית ייצא טופס 101 של העובד
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">טלפון</label>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="050-1234567" dir="ltr" className={inputCls("phone")} />
            {errMsg("phone")}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              דוא"ל<span className="text-destructive mr-1">*</span>
            </label>
            <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="user@company.co.il" dir="ltr" className={inputCls("email")} />
            {errMsg("email")}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">תאריך לידה</label>
              <input type="date" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} className={inputCls("birth_date")} dir="ltr" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">תאריך התחלה</label>
              <input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={inputCls("start_date")} dir="ltr" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium mb-1 block">סטטוס</label>
              <SearchableSelect
                value={form.status}
                onChange={(v) => set("status", v)}
                options={[
                  { value: "active", label: "פעיל" },
                  { value: "onboarding", label: "בקליטה" },
                ]}
              />
            </div>
          </div>

          {/* System access block */}
          <div className="border border-border/50 rounded-lg p-3 space-y-3 bg-muted/30">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="w-4 h-4 text-primary" />
              גישה למערכת
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">תפקיד מערכת</label>
              <SearchableSelect
                value={form.system_role}
                onChange={(v) => set("system_role", v as AppRole)}
                options={allowedSystemRoles}
              />
              {errMsg("system_role")}
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm">שלח הזמנה במייל</label>
              <Switch
                checked={form.send_invite}
                onCheckedChange={(v) => set("send_invite", v)}
              />
            </div>
          </div>

          {/* Contacts visibility */}
          <div className="flex items-center justify-between border border-border/50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-muted-foreground" />
              <label className="text-sm">אל תכלול ברשימת אנשי הקשר</label>
            </div>
            <Switch
              checked={form.exclude_from_contacts}
              onCheckedChange={(v) => set("exclude_from_contacts", v)}
            />
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

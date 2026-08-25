import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  UserPlus, AlertCircle, Mail, EyeOff, Briefcase, FileText, Upload, Trash2,
  Check, ChevronRight, ChevronLeft, User,
} from "lucide-react";
import { useCreateEmployee } from "@/hooks/useMutations";
import { useEmployees } from "@/hooks/useData";
import { useToast } from "@/hooks/use-toast";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { useSubEmployers } from "@/hooks/useSubEmployers";
import { useUploadEmployeeDocument, EMPLOYEE_DOCUMENT_TYPES } from "@/hooks/useEmployeeDocuments";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (employee: { id: string; full_name: string }) => void;
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

const STEPS = [
  { id: 0, label: "פרטים אישיים", icon: User },
  { id: 1, label: "תפקיד", icon: Briefcase },
  { id: 2, label: "מסמכים", icon: FileText },
  { id: 3, label: "הזמנה למערכת", icon: Mail },
];

const MAX_FILE_MB = 20;

interface PendingDoc {
  id: string;
  file: File;
  document_type: string;
  document_label: string;
}

type FieldErrors = Record<string, string>;

const emptyForm = {
  employee_number: "",
  full_name: "",
  id_number: "",
  phone: "",
  email: "",
  birth_date: "",
  role: "",
  department: "",
  direct_manager_id: "",
  sub_employer_id: "",
  start_date: new Date().toISOString().split("T")[0],
  status: "active" as "active" | "onboarding",
  system_role: "employee" as AppRole,
  send_invite: true,
  exclude_from_contacts: false,
};

export function EmployeeSetupWizard({ open, onOpenChange, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ ...emptyForm });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const mutation = useCreateEmployee();
  const uploadDoc = useUploadEmployeeDocument();
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
    const s = new Set<string>();
    existingEmployees?.forEach(e => e.department && s.add(e.department));
    return Array.from(s).sort().map(v => ({ value: v, label: v }));
  }, [existingEmployees]);

  const roleOptions = useMemo(() => {
    const s = new Set<string>();
    existingEmployees?.forEach(e => e.role && s.add(e.role));
    return Array.from(s).sort().map(v => ({ value: v, label: v }));
  }, [existingEmployees]);

  const managerOptions = useMemo(
    () => (existingEmployees ?? []).map(e => ({ value: e.id!, label: `${e.full_name} (${e.role ?? ""})` })),
    [existingEmployees],
  );

  const allowedSystemRoles = useMemo(() => {
    if (isAdmin || isSuperAdmin) return ALL_ROLES.filter(r => r.value !== "super_admin" || isSuperAdmin);
    if (isOperations || isHR || isPayroll) return ALL_ROLES.filter(r => !OPERATIONS_BLOCKED.includes(r.value));
    return ALL_ROLES.filter(r => r.value === "employee");
  }, [isAdmin, isSuperAdmin, isOperations, isHR, isPayroll]);

  const fullEmployeeCode = form.employee_number.trim() ? `EMP-${form.employee_number.trim()}` : "";

  const validateStep = (s: number): FieldErrors => {
    const e: FieldErrors = {};
    if (s === 0) {
      if (!form.employee_number.trim()) e.employee_number = "שדה חובה";
      else if (!/^\d{1,6}$/.test(form.employee_number.trim())) e.employee_number = "ספרות בלבד (עד 6)";
      else if (existingEmployees?.some(emp => emp.employee_code === fullEmployeeCode))
        e.employee_number = "מזהה כבר קיים במערכת";

      if (!form.full_name.trim()) e.full_name = "שדה חובה";
      else if (form.full_name.trim().length < 2) e.full_name = "שם קצר מדי";
      else if (form.full_name.trim().length > 100) e.full_name = "שם ארוך מדי";

      if (!form.id_number.trim()) e.id_number = "שדה חובה";
      else if (!isValidIsraeliId(form.id_number)) e.id_number = "תעודת זהות לא תקינה";

      if (!form.email.trim()) e.email = "שדה חובה (נדרש לצורך גישה למערכת)";
      else if (form.email.trim().length > 255) e.email = "כתובת ארוכה מדי";
      else if (!isValidEmail(form.email)) e.email = "כתובת דוא\"ל לא תקינה";

      if (form.phone && !isValidPhone(form.phone)) e.phone = "פורמט טלפון לא תקין";
    }
    if (s === 1) {
      if (!form.role.trim()) e.role = "שדה חובה";
      if (!form.department.trim()) e.department = "שדה חובה";
      if (!form.start_date) e.start_date = "שדה חובה";
    }
    if (s === 3) {
      if ((isOperations || isHR || isPayroll) && !isAdmin && !isSuperAdmin && OPERATIONS_BLOCKED.includes(form.system_role)) {
        e.system_role = "אין לך הרשאה לתפקיד זה";
      }
    }
    return e;
  };

  const goNext = () => {
    const v = validateStep(step);
    setErrors(v);
    if (Object.keys(v).length > 0) {
      toast({ title: "שגיאת ולידציה", description: "נא לתקן את השגיאות המסומנות", variant: "destructive" });
      return;
    }
    setStep(s => Math.min(3, s + 1));
  };

  const goBack = () => setStep(s => Math.max(0, s - 1));

  const addFiles = (files: File[]) => {
    const accepted: PendingDoc[] = [];
    for (const f of files) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast({ title: `${f.name} גדול מדי`, description: `מקסימום ${MAX_FILE_MB}MB`, variant: "destructive" });
        continue;
      }
      accepted.push({ id: `${f.name}-${f.size}-${Math.random()}`, file: f, document_type: "other", document_label: "" });
    }
    setDocs(prev => [...prev, ...accepted]);
  };

  const reset = () => {
    setForm({ ...emptyForm });
    setErrors({});
    setDocs([]);
    setStep(0);
  };

  const handleFinish = async () => {
    const allErrors = { ...validateStep(0), ...validateStep(1), ...validateStep(3) };
    setErrors(allErrors);
    if (Object.keys(allErrors).length > 0) {
      toast({ title: "חסרים פרטים", description: "חזור לשלבים המסומנים ותקן", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const created = await mutation.mutateAsync({
        employee_code: fullEmployeeCode,
        full_name: form.full_name.trim(),
        id_number: form.id_number.trim(),
        role: form.role.trim(),
        department: form.department.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim(),
        birth_date: form.birth_date || undefined,
        start_date: form.start_date,
        status: form.status,
        direct_manager_id: form.direct_manager_id || null,
        sub_employer_id: form.sub_employer_id || null,
        exclude_from_contacts: form.exclude_from_contacts,
      } as any);

      toast({ title: "עובד נוסף בהצלחה" });
      if (created?.id) onCreated?.({ id: created.id, full_name: form.full_name });

      // Upload collected documents
      if (created?.id && docs.length > 0) {
        let ok = 0;
        for (const d of docs) {
          try {
            await uploadDoc.mutateAsync({
              employee_id: created.id,
              file: d.file,
              document_type: d.document_type,
              document_label: d.document_label || undefined,
            });
            ok++;
          } catch (err: any) {
            toast({ title: `העלאת ${d.file.name} נכשלה`, description: err.message, variant: "destructive" });
          }
        }
        if (ok > 0) toast({ title: `${ok} מסמכים הועלו לתיק העובד` });
      }

      // Invitation
      if (form.send_invite && activeCompanyId && created?.id) {
        try {
          const { data: inviteResult, error: inviteErr } = await supabase.functions.invoke("manage-users?action=invite", {
            body: {
              company_id: activeCompanyId,
              role: form.system_role,
              employees: [{ employee_id: created.id, email: form.email.trim(), full_name: form.full_name.trim() }],
            },
          });
          if (inviteErr) throw inviteErr;
          const r = inviteResult?.results?.[0];
          if (r?.status === "invited") toast({ title: "הזמנה נשלחה", description: `מייל הזמנה נשלח אל ${form.email}` });
          else if (r?.status === "already_exists") toast({ title: "המשתמש כבר קיים", description: "החשבון קושר לעובד" });
          else if (r?.status === "failed") toast({ title: "שליחת הזמנה נכשלה", description: r.error || "ניתן לנסות שוב מ\"ערוך עובד\"", variant: "destructive" });
        } catch (inviteErr: any) {
          toast({
            title: "שליחת הזמנה נכשלה",
            description: `${inviteErr.message || "שגיאה"} — העובד נוצר, ניתן לשלוח הזמנה ידנית`,
            variant: "destructive",
          });
        }
      }

      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = (k: string) =>
    `w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 transition-all ${
      errors[k] ? "ring-2 ring-destructive/50 focus:ring-destructive/50" : "focus:ring-primary/30"
    }`;

  const errMsg = (k: string) => errors[k] && (
    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
      <AlertCircle className="w-3 h-3" aria-hidden="true" />
      {errors[k]}
    </p>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" aria-hidden="true" />
            ויזארד קליטת עובד
          </DialogTitle>
          <DialogDescription>ארבעה שלבים קצרים להקמת עובד חדש</DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <ol className="flex items-center gap-1 sm:gap-2 mt-2" aria-label="שלבי הקליטה">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <li key={s.id} className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 min-w-0 rounded-full px-2 py-1 transition-colors",
                    active && "bg-primary/10 text-primary",
                    done && "text-primary hover:bg-muted",
                    !active && !done && "text-muted-foreground",
                  )}
                >
                  <span className={cn(
                    "w-6 h-6 shrink-0 rounded-full flex items-center justify-center border text-[11px]",
                    active ? "border-primary bg-primary text-primary-foreground"
                      : done ? "border-primary bg-primary/15" : "border-border",
                  )}>
                    {done ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
                  </span>
                  <span className="text-[11px] sm:text-xs truncate">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && <span className="h-0.5 flex-1 bg-border rounded" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>

        <div className="space-y-3 mt-4">
          {/* Step 0 — personal */}
          {step === 0 && (
            <div className="space-y-3 animate-fade-in">
              <div>
                <label className="text-sm font-medium mb-1 block">מס' עובד<span className="text-destructive mr-1">*</span></label>
                <div className="flex gap-2 items-center" dir="ltr">
                  <span className="px-3 py-2 bg-muted/60 rounded-lg text-sm font-mono text-muted-foreground select-none">EMP-</span>
                  <input
                    value={form.employee_number}
                    onChange={(e) => set("employee_number", e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="009" inputMode="numeric" dir="ltr"
                    className={`flex-1 ${inputCls("employee_number")}`}
                  />
                </div>
                {errMsg("employee_number")}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">שם מלא<span className="text-destructive mr-1">*</span></label>
                <input value={form.full_name} maxLength={100} onChange={(e) => set("full_name", e.target.value)} placeholder="ישראל ישראלי" className={inputCls("full_name")} />
                {errMsg("full_name")}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">תעודת זהות<span className="text-destructive mr-1">*</span></label>
                <input value={form.id_number} maxLength={9} onChange={(e) => set("id_number", e.target.value.replace(/\D/g, ""))} placeholder="123456789" dir="ltr" className={inputCls("id_number")} />
                {errMsg("id_number")}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">דוא"ל<span className="text-destructive mr-1">*</span></label>
                  <input value={form.email} maxLength={255} onChange={(e) => set("email", e.target.value)} placeholder="user@company.co.il" dir="ltr" className={inputCls("email")} />
                  {errMsg("email")}
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">טלפון</label>
                  <input value={form.phone} maxLength={20} onChange={(e) => set("phone", e.target.value)} placeholder="050-1234567" dir="ltr" className={inputCls("phone")} />
                  {errMsg("phone")}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">תאריך לידה</label>
                <input type="date" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} className={inputCls("birth_date")} dir="ltr" />
              </div>
              <div className="flex items-center justify-between border border-border/50 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  <label className="text-sm">אל תכלול ברשימת אנשי הקשר</label>
                </div>
                <Switch checked={form.exclude_from_contacts} onCheckedChange={(v) => set("exclude_from_contacts", v)} />
              </div>
            </div>
          )}

          {/* Step 1 — role */}
          {step === 1 && (
            <div className="space-y-3 animate-fade-in">
              <div>
                <label className="text-sm font-medium mb-1 block">תפקיד<span className="text-destructive mr-1">*</span></label>
                <SearchableSelect
                  value={form.role} onChange={(v) => set("role", v)} options={roleOptions}
                  placeholder="בחר או הוסף תפקיד" searchPlaceholder="חפש או הקלד תפקיד חדש..." allowCreate error={!!errors.role}
                />
                {errMsg("role")}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">מחלקה<span className="text-destructive mr-1">*</span></label>
                <SearchableSelect
                  value={form.department} onChange={(v) => set("department", v)} options={departmentOptions}
                  placeholder="בחר או הוסף מחלקה" searchPlaceholder="חפש או הקלד מחלקה חדשה..." allowCreate error={!!errors.department}
                />
                {errMsg("department")}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">מנהל ישיר</label>
                <SearchableSelect
                  value={form.direct_manager_id} onChange={(v) => set("direct_manager_id", v)}
                  options={[{ value: "", label: "ללא" }, ...managerOptions]}
                  placeholder="בחר מנהל ישיר (אופציונלי)" searchPlaceholder="חפש עובד..."
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">מעסיק</label>
                <SearchableSelect
                  value={form.sub_employer_id} onChange={(v) => set("sub_employer_id", v)}
                  options={[
                    { value: "", label: `החברה הראשית — ${activeCompany?.name ?? ""}` },
                    ...subEmployers.map((s) => ({ value: s.id, label: `${s.legal_name} (${s.tax_id})` })),
                  ]}
                  placeholder="החברה הראשית" searchPlaceholder="חפש מעסיק..."
                />
                <p className="text-[11px] text-muted-foreground mt-1">קובע באיזו ישות משפטית ייצא טופס 101 של העובד</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">תאריך התחלה<span className="text-destructive mr-1">*</span></label>
                  <input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={inputCls("start_date")} dir="ltr" />
                  {errMsg("start_date")}
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">סטטוס</label>
                  <SearchableSelect
                    value={form.status} onChange={(v) => set("status", v)}
                    options={[{ value: "active", label: "פעיל" }, { value: "onboarding", label: "בקליטה" }]}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — documents */}
          {step === 2 && (
            <div className="space-y-3 animate-fade-in">
              <label
                htmlFor="wizard-docs"
                className="flex flex-col items-center justify-center gap-2 border border-dashed border-border rounded-xl py-8 cursor-pointer hover:bg-muted/50 transition-colors text-center px-4"
              >
                <Upload className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-medium">גרור קבצים או לחץ לבחירה</span>
                <span className="text-xs text-muted-foreground">חוזה העסקה, ת"ז, תעודות — עד {MAX_FILE_MB}MB לקובץ</span>
                <input
                  id="wizard-docs" type="file" multiple className="sr-only"
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.currentTarget.value = ""; }}
                />
              </label>

              {docs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center">
                  שלב אופציונלי — ניתן להעלות מסמכים גם בהמשך מתוך תיק העובד.
                </p>
              ) : (
                <ul className="space-y-2">
                  {docs.map((d) => (
                    <li key={d.id} className="border border-border/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                        <span className="text-sm truncate flex-1">{d.file.name}</span>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {(d.file.size / 1024 / 1024).toFixed(1)}MB
                        </span>
                        <Button
                          size="icon" variant="ghost" aria-label={`הסר ${d.file.name}`}
                          onClick={() => setDocs(prev => prev.filter(x => x.id !== d.id))}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" aria-hidden="true" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <SearchableSelect
                          value={d.document_type}
                          onChange={(v) => setDocs(prev => prev.map(x => x.id === d.id ? { ...x, document_type: v } : x))}
                          options={EMPLOYEE_DOCUMENT_TYPES}
                          placeholder="סוג מסמך"
                        />
                        <input
                          value={d.document_label} maxLength={100}
                          onChange={(e) => setDocs(prev => prev.map(x => x.id === d.id ? { ...x, document_label: e.target.value } : x))}
                          placeholder="תיאור (אופציונלי)"
                          className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Step 3 — invite + summary */}
          {step === 3 && (
            <div className="space-y-3 animate-fade-in">
              <div className="border border-border/50 rounded-lg p-3 space-y-3 bg-muted/30">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Mail className="w-4 h-4 text-primary" aria-hidden="true" />
                  גישה למערכת
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">תפקיד מערכת</label>
                  <SearchableSelect
                    value={form.system_role} onChange={(v) => set("system_role", v as AppRole)}
                    options={allowedSystemRoles}
                  />
                  {errMsg("system_role")}
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm">שלח הזמנה במייל ל-{form.email || "—"}</label>
                  <Switch checked={form.send_invite} onCheckedChange={(v) => set("send_invite", v)} />
                </div>
              </div>

              <div className="border border-border/50 rounded-lg p-3">
                <p className="text-sm font-semibold mb-2">סיכום</p>
                <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">שם</dt><dd>{form.full_name || "—"}</dd>
                  <dt className="text-muted-foreground">מס' עובד</dt><dd className="font-mono">{fullEmployeeCode || "—"}</dd>
                  <dt className="text-muted-foreground">תפקיד</dt><dd>{form.role || "—"}</dd>
                  <dt className="text-muted-foreground">מחלקה</dt><dd>{form.department || "—"}</dd>
                  <dt className="text-muted-foreground">תאריך התחלה</dt>
                  <dd>{form.start_date ? new Date(form.start_date).toLocaleDateString("en-GB") : "—"}</dd>
                  <dt className="text-muted-foreground">מסמכים</dt><dd>{docs.length}</dd>
                </dl>
              </div>
            </div>
          )}

          {/* Footer nav */}
          <div className="flex gap-3 pt-3">
            {step === 0 ? (
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>ביטול</Button>
            ) : (
              <Button variant="outline" className="flex-1" onClick={goBack}>
                <ChevronRight className="w-4 h-4 ml-1" aria-hidden="true" />
                חזור
              </Button>
            )}
            {step < 3 ? (
              <Button className="flex-1" onClick={goNext}>
                {step === 2 && docs.length === 0 ? "דלג והמשך" : "המשך"}
                <ChevronLeft className="w-4 h-4 mr-1" aria-hidden="true" />
              </Button>
            ) : (
              <Button className="flex-1" onClick={handleFinish} disabled={submitting} aria-busy={submitting}>
                {submitting ? "מקים עובד..." : "סיים והקם עובד"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

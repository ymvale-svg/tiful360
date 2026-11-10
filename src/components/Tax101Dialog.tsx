import { useEffect, useId, useMemo, useRef, useState, forwardRef } from "react";
import { Stepper } from "@/components/ui/stepper";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SignaturePad, SignaturePadHandle } from "@/components/SignaturePad";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, ChevronLeft, FileText, Plus, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { generateAndUploadTax101Pdf } from "@/lib/generateTax101Pdf";
import { useSubmitTax101 } from "@/hooks/useTax101";
import { supabase } from "@/integrations/supabase/client";
import { validateTax101 } from "@/lib/validateTax101";
import { Tax101ValidationPanel } from "@/components/Tax101ValidationPanel";
import { focusFirstInvalid } from "@/components/feedback/FormField";

interface Dependent {
  full_name: string;
  id_number: string;
  birth_date: string;
  is_in_custody: boolean;
  receives_allowance: boolean;
}

interface AdditionalEmployer {
  employer_name: string;
  employer_address: string;
  income_type: string;
  monthly_gross: number | "";
  tax_withheld_percent: number | "";
}

export interface Tax101FormData {
  // Personal
  first_name: string;
  last_name: string;
  id_number: string;
  passport_number: string;
  gender: "male" | "female" | "";
  birth_date: string;
  country_of_birth: string;
  aliyah_date: string;
  phone: string;
  mobile_phone: string;
  email: string;
  // Address & marital
  street: string;
  house_number: string;
  city: string;
  postal_code: string;
  po_box: string;
  marital_status: "single" | "married" | "divorced" | "widowed" | "separated" | "";
  is_israeli_resident: boolean;
  health_fund_member: boolean;
  health_fund_name: string;
  kibbutz_member: "no" | "yes_transferred" | "yes_not_transferred" | "";
  spouse_last_name: string;
  spouse_first_name: string;
  spouse_id: string;
  spouse_passport: string;
  spouse_birth_date: string;
  spouse_aliyah_date: string;
  spouse_income_status: "no_income" | "has_income" | "other_income" | "";
  spouse_income_sources: { work: boolean; pension: boolean; business: boolean };
  spouse_works: boolean;
  // Dependents
  dependents: Dependent[];
  // Income (section ד)
  income_type: "monthly" | "monthly_additional" | "partial" | "daily" | "pension" | "scholarship" | "retirement_grant" | "";
  job_start_date: string;
  is_main_income: boolean;
  has_other_income: boolean;
  other_income_details: string;
  // Section ח — tax credits / exemptions (official 0101/130 layout)
  tax_credits: {
    israeli_resident: boolean;                 // 1
    blind_or_disabled: boolean;                // 2א — נכה 100% / עיוור
    blind_or_disabled_period_at_least_year: boolean;
    disability_compensation_recipient: boolean; // 2ב — תגמול לפי חוק הנכים
    settlement_eligible: boolean;              // 3 — תושב יישוב מזכה
    settlement_start_date: string;
    new_immigrant: boolean;                    // 4 — עולה חדש
    new_immigrant_started_after_aliyah: boolean;
    single_parent_no_spouse_income: boolean;   // 5 — בן/בת זוג ללא הכנסה
    single_parent_with_spouse_income: boolean; // 6 — הורה במשפחה חד-הורית
    children_in_custody: boolean;              // 7 — ילדים בחזקתי
    children_in_custody_born_this_year: number | "";
    children_in_custody_age_1: number | "";
    children_in_custody_age_2_to_3: number | "";
    children_in_custody_age_4_to_5: number | "";
    children_in_custody_age_6_to_17: number | "";
    children_in_custody_age_18: number | "";
    children_not_in_custody: boolean;          // 8 — ילדים שאינם בחזקתי
    children_not_in_custody_born_this_year: number | "";
    children_not_in_custody_age_1: number | "";
    children_not_in_custody_age_2_to_3: number | "";
    children_not_in_custody_age_4_to_5: number | "";
    children_not_in_custody_age_6_to_17: number | "";
    children_not_in_custody_age_18: number | "";
    single_parent: boolean;                    // 9 — הורה יחיד
    children_with_alimony: boolean;            // 10 — ילדים שמשתתף בכלכלתם
    parent_to_disabled_child: boolean;         // 11 — הורה לילד עם מוגבלות
    alimony_to_ex_spouse: boolean;             // 12 — מזונות לבן/בת זוג לשעבר
    child_aged_16_to_18: boolean;              // 13 — בני 16-18
    child_aged_16_to_18_count: number | "";
    discharged_soldier: boolean;               // 14 — חייל/ת משוחרר
    discharged_soldier_service_start_date: string;
    discharged_soldier_service_end_date: string;
    academic_degree_completed: boolean;        // 15 — סיום לימודים אקדמיים
    academic_degree_end_date: string;
    reservist_combat: boolean;                 // 16 — לוחם מילואים
    reservist_combat_days: number | "";
  };
  // Section ט — תיאום מס
  tax_coordination: {
    no_income_until_start: boolean;
    has_additional_employers: boolean;
    additional_employers: AdditionalEmployer[];
    assessor_approval: boolean;
  };
  notes: string;
}

const emptyForm = (employee?: any): Tax101FormData => {
  const fullName = employee?.full_name ?? "";
  const [first = "", ...rest] = fullName.split(" ");
  return {
    first_name: first,
    last_name: rest.join(" "),
    id_number: employee?.id_number ?? "",
    passport_number: "",
    gender: employee?.gender ?? "",
    birth_date: employee?.birth_date ?? "",
    country_of_birth: employee?.country_of_birth ?? "ישראל",
    aliyah_date: employee?.aliyah_date ?? "",
    phone: employee?.phone ?? "",
    mobile_phone: employee?.phone ?? "",
    email: employee?.email ?? "",
    street: employee?.street ?? "",
    house_number: employee?.house_number ?? "",
    city: employee?.city ?? "",
    postal_code: employee?.postal_code ?? "",
    po_box: employee?.po_box ?? "",
    marital_status: employee?.marital_status ?? "",
    is_israeli_resident: employee?.is_israeli_resident ?? true,
    health_fund_member: employee?.health_fund_member ?? true,
    health_fund_name: employee?.health_fund_name ?? "",
    kibbutz_member: "no",
    spouse_last_name: "",
    spouse_first_name: "",
    spouse_id: "",
    spouse_passport: "",
    spouse_birth_date: "",
    spouse_aliyah_date: "",
    spouse_income_status: "",
    spouse_income_sources: { work: false, pension: false, business: false },
    spouse_works: false,
    dependents: [],
    income_type: "monthly",
    job_start_date: employee?.start_date ?? "",
    is_main_income: true,
    has_other_income: false,
    other_income_details: "",
    tax_credits: {
      israeli_resident: !!(employee?.is_israeli_resident ?? true),
      blind_or_disabled: false,
      blind_or_disabled_period_at_least_year: false,
      disability_compensation_recipient: false,
      settlement_eligible: false,
      settlement_start_date: "",
      new_immigrant: false,
      new_immigrant_started_after_aliyah: false,
      single_parent_no_spouse_income: false,
      single_parent_with_spouse_income: false,
      children_in_custody: false,
      children_in_custody_born_this_year: "",
      children_in_custody_age_1: "",
      children_in_custody_age_2_to_3: "",
      children_in_custody_age_4_to_5: "",
      children_in_custody_age_6_to_17: "",
      children_in_custody_age_18: "",
      children_not_in_custody: false,
      children_not_in_custody_born_this_year: "",
      children_not_in_custody_age_1: "",
      children_not_in_custody_age_2_to_3: "",
      children_not_in_custody_age_4_to_5: "",
      children_not_in_custody_age_6_to_17: "",
      children_not_in_custody_age_18: "",
      single_parent: false,
      children_with_alimony: false,
      parent_to_disabled_child: false,
      alimony_to_ex_spouse: false,
      child_aged_16_to_18: false,
      child_aged_16_to_18_count: "",
      discharged_soldier: false,
      discharged_soldier_service_start_date: "",
      discharged_soldier_service_end_date: "",
      academic_degree_completed: false,
      academic_degree_end_date: "",
      reservist_combat: false,
      reservist_combat_days: "",
    },
    tax_coordination: {
      no_income_until_start: false,
      has_additional_employers: false,
      additional_employers: [],
      assessor_approval: false,
    },
    notes: "",
  };
};

/** Visual required marker; the control itself carries aria-required. */
const Req = () => <span className="text-destructive ms-0.5" aria-hidden="true">*</span>;

const PrefilledBadge = () => (
  <Badge variant="secondary" className="text-xs h-5 px-1.5 font-normal opacity-70">
    מולא מהפרופיל
  </Badge>
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  taxYear: number;
  employee: any;
  onSuccess?: () => void;
  /** When true, uses public/anon update path (token flow). */
  isTokenFlow?: boolean;
  /** Employer details supplied by the caller (token flow — anon cannot read tables). */
  employerOverride?: { name: string; tax_id: string; address?: string; phone?: string } | null;
}

const MISSING_ID_MSG = "יש להזין תעודת זהות או מספר דרכון";

const STEPS = [
  "פרטים אישיים",
  "כתובת ומצב משפחתי",
  "ילדים",
  "הכנסות וזיכויים",
  "תיאום מס",
  "חתימה",
];

export function Tax101Dialog({ open, onOpenChange, formId, taxYear, employee, onSuccess, isTokenFlow, employerOverride }: Props) {

  const { toast } = useToast();
  const submit = useSubmitTax101();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Tax101FormData>(() => emptyForm(employee));
  const [submitting, setSubmitting] = useState(false);
  const [employerInfo, setEmployerInfo] = useState<{ name: string; tax_id: string; address?: string; phone?: string } | null>(null);
  const sigRef = useRef<SignaturePadHandle>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Stable, per-instance ids so labels/errors never clash if the dialog renders twice.
  const uid = useId();
  const fid = (name: string) => `t101${uid}-${name}`;
  // Inline errors of the current step, keyed by field name.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Tax101FormData, string>>>({});
  const [focusRequest, setFocusRequest] = useState(0);

  useEffect(() => {
    if (focusRequest > 0) focusFirstInvalid(bodyRef.current);
  }, [focusRequest]);

  /** id + required/invalid/describedby wiring for a validated control. */
  const fieldA11y = (name: keyof Tax101FormData, required = false) => {
    const err = fieldErrors[name];
    return {
      id: fid(name),
      "aria-required": required || undefined,
      "aria-invalid": err ? true : undefined,
      "aria-describedby": err ? `${fid(name)}-error` : undefined,
    } as const;
  };
  const fieldError = (name: keyof Tax101FormData) =>
    fieldErrors[name] ? (
      <p id={`${fid(name)}-error`} className="text-xs font-medium text-destructive-text">{fieldErrors[name]}</p>
    ) : null;
  const goToStep = (s: number) => {
    setFieldErrors({});
    setStep(s);
  };

  // Live validation against the official 0101/130 requirements.
  // Recomputed on every change so step 5 always shows the current state.
  const validation = useMemo(() => validateTax101(data), [data]);

  // Load employer (sub_employer if set, else company) for the PDF
  useEffect(() => {
    if (!open || !employee) return;
    if (employerOverride) {
      setEmployerInfo(employerOverride);
      return;
    }
    (async () => {
      try {
        if (employee.sub_employer_id) {
          const { data: se } = await (supabase as any)
            .from("sub_employers")
            .select("legal_name, tax_id, address, city, phone")
            .eq("id", employee.sub_employer_id)
            .maybeSingle();
          if (se) {
            setEmployerInfo({
              name: se.legal_name,
              tax_id: se.tax_id,
              address: [se.address, se.city].filter(Boolean).join(", "),
              phone: se.phone ?? "",
            });
            return;
          }
        }
        if (employee.company_id) {
          const { data: c } = await supabase
            .from("companies")
            .select("name")
            .eq("id", employee.company_id)
            .maybeSingle();
          if (c) setEmployerInfo({ name: c.name, tax_id: "", address: "", phone: "" });
        }
      } catch { /* ignore */ }
    })();
  }, [open, employee, employerOverride]);


  const draftKey = `tax101-draft-${formId}`;

  // Load draft / employee data on open
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setFieldErrors({});
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        setData({ ...emptyForm(employee), ...JSON.parse(saved) });
        return;
      } catch { /* ignore */ }
    }
    setData(emptyForm(employee));
  }, [open, employee, draftKey]);

  // Auto-save draft
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => {
      localStorage.setItem(draftKey, JSON.stringify(data));
    }, 5000);
    return () => clearInterval(t);
  }, [open, data, draftKey]);

  const update = <K extends keyof Tax101FormData>(k: K, v: Tax101FormData[K]) => {
    setData((d) => ({ ...d, [k]: v }));
    setFieldErrors((e) => {
      // ID and passport are one "either" requirement: filling one clears the shared "missing" error.
      const keys: Array<keyof Tax101FormData> = k === "id_number" || k === "passport_number" ? ["id_number", "passport_number"] : [k];
      const nextErrors = { ...e };
      let changed = false;
      for (const key of keys) {
        if (key in nextErrors && (key === k || nextErrors[key] === MISSING_ID_MSG)) {
          delete nextErrors[key];
          changed = true;
        }
      }
      return changed ? nextErrors : e;
    });
  };

  const addDependent = () =>
    setData((d) => ({
      ...d,
      dependents: [...d.dependents, { full_name: "", id_number: "", birth_date: "", is_in_custody: true, receives_allowance: false }],
    }));
  const removeDependent = (i: number) =>
    setData((d) => ({ ...d, dependents: d.dependents.filter((_, idx) => idx !== i) }));
  const updateDependent = (i: number, k: keyof Dependent, v: any) =>
    setData((d) => ({ ...d, dependents: d.dependents.map((dep, idx) => idx === i ? { ...dep, [k]: v } : dep) }));

  const addEmployer = () =>
    setData((d) => ({
      ...d,
      tax_coordination: {
        ...d.tax_coordination,
        additional_employers: [
          ...d.tax_coordination.additional_employers,
          { employer_name: "", employer_address: "", income_type: "", monthly_gross: "", tax_withheld_percent: "" },
        ],
      },
    }));
  const removeEmployer = (i: number) =>
    setData((d) => ({
      ...d,
      tax_coordination: {
        ...d.tax_coordination,
        additional_employers: d.tax_coordination.additional_employers.filter((_, idx) => idx !== i),
      },
    }));
  const updateEmployer = (i: number, k: keyof AdditionalEmployer, v: any) =>
    setData((d) => ({
      ...d,
      tax_coordination: {
        ...d.tax_coordination,
        additional_employers: d.tax_coordination.additional_employers.map((emp, idx) =>
          idx === i ? { ...emp, [k]: v } : emp,
        ),
      },
    }));

  /** Same rules and messages as before, but every failing field of the step is reported (in the old order). */
  const validateStep = (): Array<[keyof Tax101FormData, string]> => {
    const errs: Array<[keyof Tax101FormData, string]> = [];
    if (step === 0) {
      const nameMsg = "יש להזין שם פרטי ושם משפחה";
      if (!data.first_name) errs.push(["first_name", nameMsg]);
      if (!data.last_name) errs.push(["last_name", nameMsg]);
      if (!data.id_number && !data.passport_number) {
        errs.push(["id_number", MISSING_ID_MSG], ["passport_number", MISSING_ID_MSG]);
      }
      if (data.id_number && !/^\d{9}$/.test(data.id_number)) errs.push(["id_number", "תעודת זהות לא תקינה (9 ספרות)"]);
      if (!data.gender) errs.push(["gender", "יש לבחור מין"]);
      if (!data.birth_date) errs.push(["birth_date", "יש להזין תאריך לידה"]);
    }
    if (step === 1) {
      const addrMsg = "יש למלא כתובת מלאה";
      if (!data.street) errs.push(["street", addrMsg]);
      if (!data.city) errs.push(["city", addrMsg]);
      if (!data.marital_status) errs.push(["marital_status", "יש לבחור מצב משפחתי"]);
      if (data.health_fund_member && !data.health_fund_name) errs.push(["health_fund_name", "יש לבחור שם קופת חולים"]);
      if (!data.kibbutz_member) errs.push(["kibbutz_member", "יש לבחור סטטוס חבר קיבוץ/מושב שיתופי"]);
    }
    return errs;
  };

  const next = () => {
    const errs = validateStep();
    if (errs.length > 0) {
      setFieldErrors(Object.fromEntries(errs) as Partial<Record<keyof Tax101FormData, string>>);
      setFocusRequest((n) => n + 1);
      toast({ title: "חסרים שדות", description: errs[0][1], variant: "destructive" });
      return;
    }
    setFieldErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prev = () => {
    setFieldErrors({});
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    // Block on official-form validation errors before producing the PDF.
    if (!validation.ok) {
      const first = validation.errors[0];
      toast({
        title: "לא ניתן ליצא PDF — חסרים שדות חובה",
        description: first ? `דוגמה: ${first.message}` : "יש לתקן את השגיאות המסומנות בתחתית המסך",
        variant: "destructive",
      });
      return;
    }
    const sig = sigRef.current?.getDataUrl();
    if (!sig) {
      toast({ title: "נדרשת חתימה", description: "אנא חתום על הטופס לפני השליחה", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await new Promise((r) => setTimeout(r, 100));
      const el = previewRef.current;
      if (!el) throw new Error("Preview not ready");

      const path = `${employee?.company_id ?? "anon"}/${formId}-${Date.now()}.pdf`;
      const pdfUrl = await generateAndUploadTax101Pdf(el, path);

      if (isTokenFlow) {
        const tokenFromUrl = window.location.pathname.split("/").pop();
        const { error } = await supabase.rpc("submit_tax_form_101_by_token", {
          _token: tokenFromUrl,
          _form_data: data as any,
          _signature: sig,
          _pdf_url: pdfUrl,
        });
        if (error) throw error;
        try { await supabase.functions.invoke("send-tax101-email", { body: { form_id: formId, access_token: tokenFromUrl, log_activity: true } }); } catch { /* email is best-effort; the form is already submitted */ }
      } else {
        await submit.mutateAsync({ formId, formData: data, signatureData: sig, pdfUrl });
      }

      localStorage.removeItem(draftKey);
      toast({ title: "הטופס נשלח בהצלחה", description: "עותק חתום נשלח למחלקת השכר" });
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      console.error(e);
      toast({ title: "שגיאה בשליחה", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const today = new Date().toLocaleDateString("en-GB");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" aria-hidden="true" />
            טופס 101 לשנת {taxYear}
          </DialogTitle>
          <DialogDescription>
            מלא את הפרטים. מה שכבר קיים אצלנו מולא עבורך — אפשר לערוך כל שדה.
          </DialogDescription>
        </DialogHeader>

        <Stepper steps={STEPS.map((label) => ({ label }))} current={step} onStepClick={goToStep} label="שלבי הטופס" className="mb-2" />

        <div ref={bodyRef} className="space-y-4 py-2">
          {/* Step 0: Personal */}
          {step === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor={fid("first_name")} className="flex items-center gap-2"><span>שם פרטי<Req /></span> {employee?.full_name && <PrefilledBadge />}</Label>
                <Input {...fieldA11y("first_name", true)} value={data.first_name} onChange={(e) => update("first_name", e.target.value)} />
                {fieldError("first_name")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fid("last_name")} className="flex items-center gap-2"><span>שם משפחה<Req /></span> {employee?.full_name && <PrefilledBadge />}</Label>
                <Input {...fieldA11y("last_name", true)} value={data.last_name} onChange={(e) => update("last_name", e.target.value)} />
                {fieldError("last_name")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fid("id_number")} className="flex items-center gap-2">תעודת זהות (9 ספרות) {employee?.id_number && <PrefilledBadge />}</Label>
                <Input {...fieldA11y("id_number", !data.passport_number)} value={data.id_number} onChange={(e) => update("id_number", e.target.value)} maxLength={9} dir="ltr" />
                {fieldError("id_number")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fid("passport_number")}>מספר דרכון <span className="text-muted-foreground text-xs">(למי שאין מס' זהות)</span></Label>
                <Input {...fieldA11y("passport_number", !data.id_number)} value={data.passport_number} onChange={(e) => update("passport_number", e.target.value)} dir="ltr" />
                {fieldError("passport_number")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fid("gender")} className="flex items-center gap-2"><span>מין<Req /></span> {employee?.gender && <PrefilledBadge />}</Label>
                <select {...fieldA11y("gender", true)} className="w-full h-10 px-3 rounded-md bg-background border border-input aria-[invalid=true]:border-destructive" value={data.gender} onChange={(e) => update("gender", e.target.value as Tax101FormData["gender"])}>
                  <option value="">בחר...</option>
                  <option value="male">זכר</option>
                  <option value="female">נקבה</option>
                </select>
                {fieldError("gender")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fid("birth_date")} className="flex items-center gap-2"><span>תאריך לידה<Req /></span> {employee?.birth_date && <PrefilledBadge />}</Label>
                <Input {...fieldA11y("birth_date", true)} type="date" value={data.birth_date} onChange={(e) => update("birth_date", e.target.value)} />
                {fieldError("birth_date")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fid("country_of_birth")} className="flex items-center gap-2">ארץ לידה {employee?.country_of_birth && <PrefilledBadge />}</Label>
                <Input id={fid("country_of_birth")} value={data.country_of_birth} onChange={(e) => update("country_of_birth", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fid("aliyah_date")} className="flex items-center gap-2">תאריך עלייה {employee?.aliyah_date && <PrefilledBadge />}</Label>
                <Input id={fid("aliyah_date")} type="date" value={data.aliyah_date} onChange={(e) => update("aliyah_date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fid("phone")} className="flex items-center gap-2">טלפון {employee?.phone && <PrefilledBadge />}</Label>
                <Input id={fid("phone")} value={data.phone} onChange={(e) => update("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fid("mobile_phone")}>טלפון נייד</Label>
                <Input id={fid("mobile_phone")} value={data.mobile_phone} onChange={(e) => update("mobile_phone", e.target.value)} />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label htmlFor={fid("email")} className="flex items-center gap-2">אימייל {employee?.email && <PrefilledBadge />}</Label>
                <Input id={fid("email")} type="email" value={data.email} onChange={(e) => update("email", e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 1: Address + marital */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">כתובת מגורים</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <Label htmlFor={fid("street")}>רחוב<Req /></Label>
                  <Input {...fieldA11y("street", true)} value={data.street} onChange={(e) => update("street", e.target.value)} />
                  {fieldError("street")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={fid("house_number")}>מספר בית</Label>
                  <Input id={fid("house_number")} value={data.house_number} onChange={(e) => update("house_number", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={fid("city")}>עיר<Req /></Label>
                  <Input {...fieldA11y("city", true)} value={data.city} onChange={(e) => update("city", e.target.value)} />
                  {fieldError("city")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={fid("postal_code")}>מיקוד</Label>
                  <Input id={fid("postal_code")} value={data.postal_code} onChange={(e) => update("postal_code", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={fid("po_box")}>ת.ד.</Label>
                  <Input id={fid("po_box")} value={data.po_box} onChange={(e) => update("po_box", e.target.value)} />
                </div>
              </div>

              <h3 className="text-sm font-semibold text-muted-foreground pt-2">מצב משפחתי</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor={fid("marital_status")}>מצב משפחתי<Req /></Label>
                  <select {...fieldA11y("marital_status", true)} className="w-full h-10 px-3 rounded-md bg-background border border-input aria-[invalid=true]:border-destructive" value={data.marital_status} onChange={(e) => update("marital_status", e.target.value as Tax101FormData["marital_status"])}>
                    <option value="">בחר...</option>
                    <option value="single">רווק/ה</option>
                    <option value="married">נשוי/אה</option>
                    <option value="divorced">גרוש/ה</option>
                    <option value="widowed">אלמן/ה</option>
                    <option value="separated">פרוד/ה</option>
                  </select>
                  {fieldError("marital_status")}
                </div>
                <div className="space-y-1.5 flex items-end gap-4">
                  <label htmlFor={fid("is_israeli_resident")} className="flex items-center gap-2 text-sm">
                    <Checkbox id={fid("is_israeli_resident")} checked={data.is_israeli_resident} onCheckedChange={(v) => update("is_israeli_resident", !!v)} />
                    תושב/ת ישראל
                  </label>
                </div>
              </div>

              <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                <p id={fid("health_fund_member-label")} className="text-sm font-medium leading-none">חבר/ה בקופת חולים</p>
                <div role="group" aria-labelledby={fid("health_fund_member-label")} className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name={fid("health_fund_member")}
                      checked={!data.health_fund_member}
                      onChange={() => {
                        update("health_fund_member", false);
                        update("health_fund_name", "");
                      }}
                    />
                    לא
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name={fid("health_fund_member")}
                      checked={data.health_fund_member}
                      onChange={() => update("health_fund_member", true)}
                    />
                    כן, שם הקופה:
                  </label>
                  {data.health_fund_member && (
                    <select
                      {...fieldA11y("health_fund_name", true)}
                      aria-label="שם קופת החולים"
                      className="h-10 px-3 rounded-md bg-background border border-input text-sm aria-[invalid=true]:border-destructive"
                      value={data.health_fund_name}
                      onChange={(e) => update("health_fund_name", e.target.value)}
                    >
                      <option value="">בחר קופה...</option>
                      <option value="כללית">כללית</option>
                      <option value="מכבי">מכבי</option>
                      <option value="מאוחדת">מאוחדת</option>
                      <option value="לאומית">לאומית</option>
                    </select>
                  )}
                </div>
                {fieldError("health_fund_name")}
              </div>

              <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                <p id={fid("kibbutz_member-label")} className="text-sm font-medium leading-none">חבר קיבוץ / מושב שיתופי<Req /></p>
                <div
                  role="radiogroup"
                  aria-labelledby={fid("kibbutz_member-label")}
                  aria-required
                  aria-describedby={fieldErrors.kibbutz_member ? `${fid("kibbutz_member")}-error` : undefined}
                  className="flex flex-col gap-2"
                >
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name={fid("kibbutz_member")}
                      checked={data.kibbutz_member === "no"}
                      aria-invalid={fieldErrors.kibbutz_member ? true : undefined}
                      onChange={() => update("kibbutz_member", "no")}
                    />
                    לא
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name={fid("kibbutz_member")}
                      checked={data.kibbutz_member === "yes_transferred"}
                      onChange={() => update("kibbutz_member", "yes_transferred")}
                    />
                    כן — ההכנסות ממעסיק זה מועברות לקיבוץ
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name={fid("kibbutz_member")}
                      checked={data.kibbutz_member === "yes_not_transferred"}
                      onChange={() => update("kibbutz_member", "yes_not_transferred")}
                    />
                    כן — ההכנסות ממעסיק זה אינן מועברות לקיבוץ
                  </label>
                </div>
                {fieldError("kibbutz_member")}
              </div>

              {data.marital_status === "married" && (
                <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                  <h4 className="text-sm font-semibold">פרטים על בן/בת הזוג</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={fid("spouse_last_name")}>שם משפחה</Label>
                      <Input id={fid("spouse_last_name")} value={data.spouse_last_name} onChange={(e) => update("spouse_last_name", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={fid("spouse_first_name")}>שם פרטי</Label>
                      <Input id={fid("spouse_first_name")} value={data.spouse_first_name} onChange={(e) => update("spouse_first_name", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={fid("spouse_id")}>מספר זהות (9 ספרות)</Label>
                      <Input id={fid("spouse_id")} value={data.spouse_id} onChange={(e) => update("spouse_id", e.target.value)} dir="ltr" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={fid("spouse_passport")}>מספר דרכון <span className="text-muted-foreground text-xs">(למי שאין מס' זהות)</span></Label>
                      <Input id={fid("spouse_passport")} value={data.spouse_passport} onChange={(e) => update("spouse_passport", e.target.value)} dir="ltr" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={fid("spouse_birth_date")}>תאריך לידה</Label>
                      <Input id={fid("spouse_birth_date")} type="date" value={data.spouse_birth_date} onChange={(e) => update("spouse_birth_date", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={fid("spouse_aliyah_date")}>תאריך עליה</Label>
                      <Input id={fid("spouse_aliyah_date")} type="date" value={data.spouse_aliyah_date} onChange={(e) => update("spouse_aliyah_date", e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <p id={fid("spouse_income_status-label")} className="text-sm font-semibold leading-none">הכנסות בן/בת הזוג</p>
                    <div role="group" aria-labelledby={fid("spouse_income_status-label")} className="space-y-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={fid("spouse_income_status")}
                          checked={data.spouse_income_status === "no_income"}
                          onChange={() => {
                            update("spouse_income_status", "no_income");
                            update("spouse_income_sources", { work: false, pension: false, business: false });
                            update("spouse_works", false);
                          }}
                        />
                        אין לבן/בת הזוג כל הכנסה
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={fid("spouse_income_status")}
                          checked={data.spouse_income_status === "has_income"}
                          onChange={() => {
                            update("spouse_income_status", "has_income");
                            update("spouse_works", true);
                          }}
                        />
                        יש לבן/בת הזוג הכנסה מ:
                      </label>
                      {data.spouse_income_status === "has_income" && (
                        <div className="flex flex-wrap gap-4 pr-6">
                          <label htmlFor={fid("spouse_income_sources-work")} className="flex items-center gap-2 text-sm">
                            <Checkbox id={fid("spouse_income_sources-work")}
                              checked={data.spouse_income_sources.work}
                              onCheckedChange={(v) => update("spouse_income_sources", { ...data.spouse_income_sources, work: !!v })}
                            />
                            עבודה
                          </label>
                          <label htmlFor={fid("spouse_income_sources-pension")} className="flex items-center gap-2 text-sm">
                            <Checkbox id={fid("spouse_income_sources-pension")}
                              checked={data.spouse_income_sources.pension}
                              onCheckedChange={(v) => update("spouse_income_sources", { ...data.spouse_income_sources, pension: !!v })}
                            />
                            קצבה
                          </label>
                          <label htmlFor={fid("spouse_income_sources-business")} className="flex items-center gap-2 text-sm">
                            <Checkbox id={fid("spouse_income_sources-business")}
                              checked={data.spouse_income_sources.business}
                              onCheckedChange={(v) => update("spouse_income_sources", { ...data.spouse_income_sources, business: !!v })}
                            />
                            עסק
                          </label>
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={fid("spouse_income_status")}
                          checked={data.spouse_income_status === "other_income"}
                          onChange={() => update("spouse_income_status", "other_income")}
                        />
                        הכנסה אחרת
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Dependents */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">ילדים מתחת לגיל 19</h3>
                <Button size="sm" variant="outline" onClick={addDependent} className="gap-1">
                  <Plus className="w-3 h-3" aria-hidden="true" /> הוסף ילד/ה
                </Button>
              </div>
              {data.dependents.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">אין ילדים. לחץ "הוסף ילד/ה" אם רלוונטי.</p>
              ) : (
                <div className="space-y-2">
                  {data.dependents.map((dep, i) => (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-3 bg-muted/30 rounded-lg">
                      <div className="md:col-span-4 space-y-1">
                        <Label htmlFor={fid(`dep-${i}-full_name`)} className="text-xs">שם מלא</Label>
                        <Input id={fid(`dep-${i}-full_name`)} value={dep.full_name} onChange={(e) => updateDependent(i, "full_name", e.target.value)} />
                      </div>
                      <div className="md:col-span-3 space-y-1">
                        <Label htmlFor={fid(`dep-${i}-id_number`)} className="text-xs">ת"ז</Label>
                        <Input id={fid(`dep-${i}-id_number`)} value={dep.id_number} onChange={(e) => updateDependent(i, "id_number", e.target.value)} maxLength={9} />
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <Label htmlFor={fid(`dep-${i}-birth_date`)} className="text-xs">תאריך לידה</Label>
                        <Input id={fid(`dep-${i}-birth_date`)} type="date" value={dep.birth_date} onChange={(e) => updateDependent(i, "birth_date", e.target.value)} />
                      </div>
                      <div className="md:col-span-2 flex flex-col gap-1 text-xs">
                        <label htmlFor={fid(`dep-${i}-is_in_custody`)} className="flex items-center gap-1">
                          <Checkbox id={fid(`dep-${i}-is_in_custody`)} checked={dep.is_in_custody} onCheckedChange={(v) => updateDependent(i, "is_in_custody", !!v)} />
                          בחזקתי
                        </label>
                        <label htmlFor={fid(`dep-${i}-receives_allowance`)} className="flex items-center gap-1">
                          <Checkbox id={fid(`dep-${i}-receives_allowance`)} checked={dep.receives_allowance} onCheckedChange={(v) => updateDependent(i, "receives_allowance", !!v)} />
                          קצבת ילדים
                        </label>
                      </div>
                      <div className="md:col-span-1">
                        <Button size="icon" variant="ghost" aria-label={`הסר ילד ${i + 1}`} onClick={() => removeDependent(i)}>
                          <Trash2 className="w-4 h-4 text-destructive" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Income + Section ח */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor={fid("income_type")}>ד. סוג ההכנסה ממעסיק זה</Label>
                  <select id={fid("income_type")} className="w-full h-10 px-3 rounded-md bg-background border border-input" value={data.income_type} onChange={(e) => update("income_type", e.target.value as any)}>
                    <option value="">בחר…</option>
                    <option value="monthly">(2) משכורת חודש</option>
                    <option value="monthly_additional">(3) משכורת בעד משרה נוספת</option>
                    <option value="partial">(4) משכורת חלקית</option>
                    <option value="daily">(5) שכר עבודה (עובד יומי)</option>
                    <option value="pension">(6) קצבה</option>
                    <option value="scholarship">(1) מלגה</option>
                    <option value="retirement_grant">מענק פרישה</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={fid("job_start_date")} className="flex items-center gap-2">תאריך תחילת עבודה בשנת המס {employee?.start_date && <PrefilledBadge />}</Label>
                  <Input id={fid("job_start_date")} type="date" value={data.job_start_date} onChange={(e) => update("job_start_date", e.target.value)} />
                </div>
              </div>

              {/* Section ח */}
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                <h4 className="text-sm font-semibold">ח. אני מבקש/ת פטור או זיכוי ממס מהסיבות הבאות</h4>
                <p className="text-xs text-muted-foreground">סמן/י את הסעיפים הרלוונטיים. במקרים מסוימים יפתחו שדות נוספים למילוי.</p>

                {(() => {
                  const tc = data.tax_credits;
                  const setTc = (patch: Partial<typeof tc>) =>
                    update("tax_credits", { ...tc, ...patch });
                  const numInput = (id: string, val: number | "", onChange: (v: number | "") => void) => (
                    <Input
                      id={id}
                      type="number"
                      min={0}
                      className="h-11 w-20 text-base"
                      value={val}
                      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  );

                  const ageGrid = (prefix: "in_custody" | "not_in_custody") => {
                    const k = (suf: string) => `children_${prefix}_${suf}` as keyof typeof tc;
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mr-6 mt-2 text-xs">
                        <label htmlFor={fid(k("born_this_year"))} className="flex items-center gap-2">
                          נולדו בשנת המס:
                          {numInput(fid(k("born_this_year")), tc[k("born_this_year")] as number | "", (v) => setTc({ [k("born_this_year")]: v } as Partial<typeof tc>))}
                        </label>
                        <label htmlFor={fid(k("age_1"))} className="flex items-center gap-2">
                          בני 1:
                          {numInput(fid(k("age_1")), tc[k("age_1")] as number | "", (v) => setTc({ [k("age_1")]: v } as Partial<typeof tc>))}
                        </label>
                        <label htmlFor={fid(k("age_2_to_3"))} className="flex items-center gap-2">
                          בני 2–3:
                          {numInput(fid(k("age_2_to_3")), tc[k("age_2_to_3")] as number | "", (v) => setTc({ [k("age_2_to_3")]: v } as Partial<typeof tc>))}
                        </label>
                        <label htmlFor={fid(k("age_4_to_5"))} className="flex items-center gap-2">
                          בני 4–5:
                          {numInput(fid(k("age_4_to_5")), tc[k("age_4_to_5")] as number | "", (v) => setTc({ [k("age_4_to_5")]: v } as Partial<typeof tc>))}
                        </label>
                        <label htmlFor={fid(k("age_6_to_17"))} className="flex items-center gap-2">
                          בני 6–17:
                          {numInput(fid(k("age_6_to_17")), tc[k("age_6_to_17")] as number | "", (v) => setTc({ [k("age_6_to_17")]: v } as Partial<typeof tc>))}
                        </label>
                        <label htmlFor={fid(k("age_18"))} className="flex items-center gap-2">
                          בני 18:
                          {numInput(fid(k("age_18")), tc[k("age_18")] as number | "", (v) => setTc({ [k("age_18")]: v } as Partial<typeof tc>))}
                        </label>
                      </div>
                    );
                  };

                  return (
                    <div className="space-y-2 text-sm">
                      <label htmlFor={fid("israeli_resident")} className="flex items-center gap-2">
                        <Checkbox id={fid("israeli_resident")} checked={tc.israeli_resident} onCheckedChange={(v) => setTc({ israeli_resident: !!v })} />
                        1. אני תושב/ת ישראל
                      </label>

                      <div>
                        <label htmlFor={fid("blind_or_disabled")} className="flex items-center gap-2">
                          <Checkbox id={fid("blind_or_disabled")} checked={tc.blind_or_disabled} onCheckedChange={(v) => setTc({ blind_or_disabled: !!v })} />
                          2א. אני עיוור/ת או נכה 100% לצמיתות
                        </label>
                        {tc.blind_or_disabled && (
                          <label htmlFor={fid("blind_or_disabled_period_at_least_year")} className="flex items-center gap-2 mr-6 mt-1 text-xs">
                            <Checkbox id={fid("blind_or_disabled_period_at_least_year")}
                              checked={tc.blind_or_disabled_period_at_least_year}
                              onCheckedChange={(v) => setTc({ blind_or_disabled_period_at_least_year: !!v })}
                            />
                            תקופת הנכות לפחות 185 יום
                          </label>
                        )}
                      </div>

                      <label htmlFor={fid("disability_compensation_recipient")} className="flex items-center gap-2">
                        <Checkbox id={fid("disability_compensation_recipient")} checked={tc.disability_compensation_recipient} onCheckedChange={(v) => setTc({ disability_compensation_recipient: !!v })} />
                        2ב. אני מקבל/ת תגמול חודשי לפי חוק הנכים
                      </label>

                      <div>
                        <label htmlFor={fid("settlement_eligible")} className="flex items-center gap-2">
                          <Checkbox id={fid("settlement_eligible")} checked={tc.settlement_eligible} onCheckedChange={(v) => setTc({ settlement_eligible: !!v })} />
                          3. אני תושב/ת קבע ביישוב מזכה
                        </label>
                        {tc.settlement_eligible && (
                          <label htmlFor={fid("settlement_start_date")} className="flex flex-wrap items-center gap-2 mr-6 mt-1 text-xs">
                            מתאריך:
                            <Input
                              id={fid("settlement_start_date")}
                              type="date"
                              className="h-11 text-base w-44"
                              value={tc.settlement_start_date}
                              onChange={(e) => setTc({ settlement_start_date: e.target.value })}
                            />
                          </label>
                        )}
                      </div>

                      <div>
                        <label htmlFor={fid("new_immigrant")} className="flex items-center gap-2">
                          <Checkbox id={fid("new_immigrant")} checked={tc.new_immigrant} onCheckedChange={(v) => setTc({ new_immigrant: !!v })} />
                          4. אני עולה חדש/ה (זכאי/ת לזיכוי לתקופה של עד 3.5 שנים מיום העלייה)
                        </label>
                        {tc.new_immigrant && (
                          <label htmlFor={fid("new_immigrant_started_after_aliyah")} className="flex items-center gap-2 mr-6 mt-1 text-xs">
                            <Checkbox id={fid("new_immigrant_started_after_aliyah")}
                              checked={tc.new_immigrant_started_after_aliyah}
                              onCheckedChange={(v) => setTc({ new_immigrant_started_after_aliyah: !!v })}
                            />
                            תאריך תחילת העבודה אחרי תאריך העלייה
                          </label>
                        )}
                      </div>

                      <label htmlFor={fid("single_parent_no_spouse_income")} className="flex items-center gap-2">
                        <Checkbox id={fid("single_parent_no_spouse_income")} checked={tc.single_parent_no_spouse_income} onCheckedChange={(v) => setTc({ single_parent_no_spouse_income: !!v })} />
                        5. בגין בן/בת זוגי שאין לו/לה הכנסות בשנת המס
                      </label>

                      <label htmlFor={fid("single_parent_with_spouse_income")} className="flex items-center gap-2">
                        <Checkbox id={fid("single_parent_with_spouse_income")} checked={tc.single_parent_with_spouse_income} onCheckedChange={(v) => setTc({ single_parent_with_spouse_income: !!v })} />
                        6. אני הורה במשפחה חד-הורית
                      </label>

                      <div>
                        <label htmlFor={fid("children_in_custody")} className="flex items-center gap-2">
                          <Checkbox id={fid("children_in_custody")} checked={tc.children_in_custody} onCheckedChange={(v) => setTc({ children_in_custody: !!v })} />
                          7. בגין ילדיי שבחזקתי המפורטים בחלק ג'
                        </label>
                        {tc.children_in_custody && ageGrid("in_custody")}
                      </div>

                      <div>
                        <label htmlFor={fid("children_not_in_custody")} className="flex items-center gap-2">
                          <Checkbox id={fid("children_not_in_custody")} checked={tc.children_not_in_custody} onCheckedChange={(v) => setTc({ children_not_in_custody: !!v })} />
                          8. בגין ילדיי שאינם בחזקתי
                        </label>
                        {tc.children_not_in_custody && ageGrid("not_in_custody")}
                      </div>

                      <label htmlFor={fid("single_parent")} className="flex items-center gap-2">
                        <Checkbox id={fid("single_parent")} checked={tc.single_parent} onCheckedChange={(v) => setTc({ single_parent: !!v })} />
                        9. אני הורה יחיד
                      </label>

                      <label htmlFor={fid("children_with_alimony")} className="flex items-center gap-2">
                        <Checkbox id={fid("children_with_alimony")} checked={tc.children_with_alimony} onCheckedChange={(v) => setTc({ children_with_alimony: !!v })} />
                        10. בגין ילדיי שאינם בחזקתי, אך אני משתתף/ת בכלכלתם
                      </label>

                      <label htmlFor={fid("parent_to_disabled_child")} className="flex items-center gap-2">
                        <Checkbox id={fid("parent_to_disabled_child")} checked={tc.parent_to_disabled_child} onCheckedChange={(v) => setTc({ parent_to_disabled_child: !!v })} />
                        11. אני הורה לילד עם מוגבלות (זכאי/ת לגמלת ילד נכה)
                      </label>

                      <label htmlFor={fid("alimony_to_ex_spouse")} className="flex items-center gap-2">
                        <Checkbox id={fid("alimony_to_ex_spouse")} checked={tc.alimony_to_ex_spouse} onCheckedChange={(v) => setTc({ alimony_to_ex_spouse: !!v })} />
                        12. בגין מזונות שאני משלם/ת לבן/בת זוג לשעבר
                      </label>

                      <div>
                        <label htmlFor={fid("child_aged_16_to_18")} className="flex items-center gap-2">
                          <Checkbox id={fid("child_aged_16_to_18")} checked={tc.child_aged_16_to_18} onCheckedChange={(v) => setTc({ child_aged_16_to_18: !!v })} />
                          13. יש לי ילדים בני 16–18 בשנת המס
                        </label>
                        {tc.child_aged_16_to_18 && (
                          <label htmlFor={fid("child_aged_16_to_18_count")} className="flex items-center gap-2 mr-6 mt-1 text-xs">
                            מספר ילדים:
                            {numInput(fid("child_aged_16_to_18_count"), tc.child_aged_16_to_18_count, (v) => setTc({ child_aged_16_to_18_count: v }))}
                          </label>
                        )}
                      </div>

                      <div>
                        <label htmlFor={fid("discharged_soldier")} className="flex items-center gap-2">
                          <Checkbox id={fid("discharged_soldier")} checked={tc.discharged_soldier} onCheckedChange={(v) => setTc({ discharged_soldier: !!v })} />
                          14. אני חייל/ת משוחרר/ת
                        </label>
                        {tc.discharged_soldier && (
                          <div className="flex flex-wrap gap-3 mr-6 mt-1 text-xs items-center">
                            <label htmlFor={fid("discharged_soldier_service_start_date")} className="flex flex-wrap items-center gap-2">
                              תאריכי שירות מ:
                              <Input
                                id={fid("discharged_soldier_service_start_date")}
                                type="date"
                                className="h-11 text-base w-40"
                                value={tc.discharged_soldier_service_start_date}
                                onChange={(e) => setTc({ discharged_soldier_service_start_date: e.target.value })}
                              />
                            </label>
                            <label htmlFor={fid("discharged_soldier_service_end_date")} className="flex flex-wrap items-center gap-2">
                              עד:
                              <Input
                                id={fid("discharged_soldier_service_end_date")}
                                type="date"
                                className="h-11 text-base w-40"
                                value={tc.discharged_soldier_service_end_date}
                                onChange={(e) => setTc({ discharged_soldier_service_end_date: e.target.value })}
                              />
                            </label>
                          </div>
                        )}
                      </div>

                      <div>
                        <label htmlFor={fid("academic_degree_completed")} className="flex items-center gap-2">
                          <Checkbox id={fid("academic_degree_completed")} checked={tc.academic_degree_completed} onCheckedChange={(v) => setTc({ academic_degree_completed: !!v })} />
                          15. סיימתי לימודים אקדמיים (מצורף טופס 119)
                        </label>
                        {tc.academic_degree_completed && (
                          <label htmlFor={fid("academic_degree_end_date")} className="flex flex-wrap items-center gap-2 mr-6 mt-1 text-xs">
                            תאריך סיום:
                            <Input
                              id={fid("academic_degree_end_date")}
                              type="date"
                              className="h-11 text-base w-44"
                              value={tc.academic_degree_end_date}
                              onChange={(e) => setTc({ academic_degree_end_date: e.target.value })}
                            />
                          </label>
                        )}
                      </div>

                      <div>
                        <label htmlFor={fid("reservist_combat")} className="flex items-center gap-2">
                          <Checkbox id={fid("reservist_combat")} checked={tc.reservist_combat} onCheckedChange={(v) => setTc({ reservist_combat: !!v })} />
                          16. שירתתי כלוחם/ת מילואים
                        </label>
                        {tc.reservist_combat && (
                          <label htmlFor={fid("reservist_combat_days")} className="flex items-center gap-2 mr-6 mt-1 text-xs">
                            מספר ימי שירות:
                            {numInput(fid("reservist_combat_days"), tc.reservist_combat_days, (v) => setTc({ reservist_combat_days: v }))}
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={fid("notes")}>הערות נוספות</Label>
                <Textarea id={fid("notes")} value={data.notes} onChange={(e) => update("notes", e.target.value)} rows={2} />
              </div>
            </div>
          )}

          {/* Step 4: Section ט — Tax coordination */}
          {step === 4 && (
            <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
              <h4 className="text-sm font-semibold">ט. אני מבקש/ת תיאום מס מהסיבות הבאות</h4>

              <label htmlFor={fid("tax_coordination-no_income_until_start")} className="flex items-center gap-2 text-sm">
                <Checkbox id={fid("tax_coordination-no_income_until_start")}
                  checked={data.tax_coordination.no_income_until_start}
                  onCheckedChange={(v) =>
                    update("tax_coordination", { ...data.tax_coordination, no_income_until_start: !!v })
                  }
                />
                1. לא היתה לי הכנסה מתחילת שנת המס ועד תחילת עבודתי אצל מעסיק זה
              </label>

              <div>
                <label htmlFor={fid("tax_coordination-has_additional_employers")} className="flex items-center gap-2 text-sm">
                  <Checkbox id={fid("tax_coordination-has_additional_employers")}
                    checked={data.tax_coordination.has_additional_employers}
                    onCheckedChange={(v) =>
                      update("tax_coordination", { ...data.tax_coordination, has_additional_employers: !!v })
                    }
                  />
                  2. יש לי הכנסות נוספות ממשכורת / קצבה
                </label>
                {data.tax_coordination.has_additional_employers && (
                  <div className="mt-2 space-y-2 mr-6">
                    {data.tax_coordination.additional_employers.length === 0 && (
                      <p className="text-xs text-muted-foreground">לא נוספו מעסיקים. לחץ "הוסף מעסיק".</p>
                    )}
                    {data.tax_coordination.additional_employers.map((emp, i) => (
                      <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-2 bg-background rounded">
                        <div className="md:col-span-3 space-y-1">
                          <Label htmlFor={fid(`emp-${i}-employer_name`)} className="text-xs">שם המעסיק</Label>
                          <Input id={fid(`emp-${i}-employer_name`)} className="h-11 text-base" value={emp.employer_name} onChange={(e) => updateEmployer(i, "employer_name", e.target.value)} />
                        </div>
                        <div className="md:col-span-3 space-y-1">
                          <Label htmlFor={fid(`emp-${i}-employer_address`)} className="text-xs">כתובת</Label>
                          <Input id={fid(`emp-${i}-employer_address`)} className="h-11 text-base" value={emp.employer_address} onChange={(e) => updateEmployer(i, "employer_address", e.target.value)} />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                          <Label htmlFor={fid(`emp-${i}-income_type`)} className="text-xs">סוג ההכנסה</Label>
                          <Input id={fid(`emp-${i}-income_type`)} className="h-11 text-base" value={emp.income_type} onChange={(e) => updateEmployer(i, "income_type", e.target.value)} />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                          <Label htmlFor={fid(`emp-${i}-monthly_gross`)} className="text-xs">הכנסה חודשית</Label>
                          <Input
                            id={fid(`emp-${i}-monthly_gross`)}
                            type="number"
                            className="h-11 text-base"
                            value={emp.monthly_gross}
                            onChange={(e) => updateEmployer(i, "monthly_gross", e.target.value === "" ? "" : Number(e.target.value))}
                          />
                        </div>
                        <div className="md:col-span-1 space-y-1">
                          <Label htmlFor={fid(`emp-${i}-tax_withheld_percent`)} className="text-xs">מס %</Label>
                          <Input
                            id={fid(`emp-${i}-tax_withheld_percent`)}
                            type="number"
                            className="h-11 text-base"
                            value={emp.tax_withheld_percent}
                            onChange={(e) => updateEmployer(i, "tax_withheld_percent", e.target.value === "" ? "" : Number(e.target.value))}
                          />
                        </div>
                        <div className="md:col-span-1">
                          <Button size="icon" variant="ghost" aria-label={`הסר מעסיק ${i + 1}`} onClick={() => removeEmployer(i)}>
                            <Trash2 className="w-4 h-4 text-destructive" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={addEmployer} className="gap-1">
                      <Plus className="w-3 h-3" aria-hidden="true" /> הוסף מעסיק
                    </Button>
                  </div>
                )}
              </div>

              <label htmlFor={fid("tax_coordination-assessor_approval")} className="flex items-center gap-2 text-sm">
                <Checkbox id={fid("tax_coordination-assessor_approval")}
                  checked={data.tax_coordination.assessor_approval}
                  onCheckedChange={(v) =>
                    update("tax_coordination", { ...data.tax_coordination, assessor_approval: !!v })
                  }
                />
                3. פקיד השומה אישר תיאום מס (יש לצרף אישור)
              </label>
            </div>
          )}

          {/* Step 5: Sign */}
          {step === 5 && (
            <div className="space-y-4">
              {/* Pre-export validation against the official 0101/130 layout */}
              <Tax101ValidationPanel result={validation} onJumpToStep={goToStep} />

              <div className="p-3 bg-muted/30 rounded-lg text-xs space-y-1">
                <p className="font-semibold">י. הצהרה:</p>
                <p>אני מצהיר/ה כי כל הפרטים שמסרתי בטופס זה הם נכונים ומלאים, וידוע לי כי מסירת פרטים לא נכונים מהווה עבירה לפי פקודת מס הכנסה.</p>
              </div>
              <SignaturePad ref={sigRef} label="חתימת העובד/ת" />
              <p className="text-xs text-muted-foreground">תאריך חתימה: {today}</p>

              <div className="border border-border rounded-lg overflow-hidden" style={{ maxHeight: 400, overflowY: "auto" }}>
                <p className="text-xs text-muted-foreground p-2 bg-muted/40">תצוגה מקדימה — תופיע ב-PDF המוגש</p>
                <Tax101Preview ref={previewRef} data={data} taxYear={taxYear} signatureRef={sigRef} employerInfo={employerInfo} />
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <Button variant="outline" onClick={prev} disabled={step === 0 || submitting} className="gap-1">
            <ChevronRight className="w-4 h-4" aria-hidden="true" /> הקודם
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={next} className="gap-1">
              הבא <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting || !validation.ok}
              title={!validation.ok ? "יש לתקן את שגיאות הבדיקה לפני יצוא PDF" : undefined}
              className="gap-1.5"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4" aria-hidden="true" />}
              {submitting ? "שולח..." : "אשר ושלח"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================
// Official 0101/130 PDF Preview
// ============================

// CSS-drawn checkbox — does not depend on Unicode font availability,
// so html2canvas always renders ☒/☐ identically.
const CB = ({ on }: { on?: boolean }) => (
  <span
    style={{
      display: "inline-block",
      width: 11,
      height: 11,
      border: "1.2px solid #000",
      verticalAlign: "-2px",
      marginInlineEnd: 4,
      position: "relative",
      background: "#fff",
      boxSizing: "border-box",
    }}
  >
    {on && (
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          lineHeight: 1,
          fontWeight: 900,
          color: "#000",
          // Use a simple "X" — universally available, no glyph fallback issues.
          fontFamily: "Arial, sans-serif",
        }}
      >
        ✕
      </span>
    )}
  </span>
);

const Section: React.FC<{ title: string; children: React.ReactNode; pageBreak?: boolean }> = ({ title, children, pageBreak }) => (
  <div
    style={{
      marginTop: 8,
      pageBreakBefore: pageBreak ? "always" : "auto",
      // Keep each section together when slicing the rendered canvas
      breakInside: "avoid",
      pageBreakInside: "avoid",
    } as React.CSSProperties}
  >
    <div
      style={{
        background: "#e5e7eb",
        border: "1px solid #000",
        padding: "3px 6px",
        fontWeight: 700,
        fontSize: 11,
      }}
    >
      {title}
    </div>
    <div style={{ border: "1px solid #000", borderTop: "none", padding: 6, fontSize: 10, lineHeight: 1.55 }}>
      {children}
    </div>
  </div>
);

const Field: React.FC<{ label: string; value?: string | null; minWidth?: number }> = ({ label, value, minWidth = 80 }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "baseline",
      marginLeft: 10,
      marginBottom: 3,
      // Don't let a field wrap awkwardly in the middle of label/value
      whiteSpace: "nowrap",
    }}
  >
    <span style={{ fontWeight: 600, marginInlineEnd: 4 }}>{label}:</span>
    <span style={{ minWidth, borderBottom: "1px solid #000", padding: "0 4px", display: "inline-block" }}>
      {value || "\u00A0"}
    </span>
  </span>
);


const Tax101Preview = forwardRef<
  HTMLDivElement,
  { data: Tax101FormData; taxYear: number; signatureRef: React.RefObject<SignaturePadHandle>; employerInfo?: { name: string; tax_id: string; address?: string; phone?: string } | null }
>(({ data, taxYear, signatureRef, employerInfo }, ref) => {
  const tc = data.tax_credits;
  const co = data.tax_coordination;
  const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString("en-GB") : "";
  const maritalText = ({
    single: "רווק/ה", married: "נשוי/אה", divorced: "גרוש/ה", widowed: "אלמן/ה", separated: "פרוד/ה",
  } as any)[data.marital_status] || "";
  const incomeBox = (key: typeof data.income_type, label: string) => (
    <span style={{ marginInlineEnd: 12, whiteSpace: "nowrap" }}>
      <CB on={data.income_type === key} /> {label}
    </span>
  );

  return (
    <div
      ref={ref}
      dir="rtl"
      style={{
        background: "#fff",
        color: "#000",
        padding: 18,
        fontFamily: "Arial, 'Arial Unicode MS', sans-serif",
        width: 794, // A4 width @ 96dpi
        fontSize: 10,
        lineHeight: 1.4,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #000", paddingBottom: 6 }}>
        <div style={{ fontSize: 9, color: "#333" }}>דף 1 מתוך 2</div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>כרטיס עובד (1) — טופס 101 לשנת המס {taxYear}</div>
          <div style={{ fontSize: 10 }}>בקשה להקלה ולתיאום מס על ידי המעסיק</div>
          <div style={{ fontSize: 9, color: "#444" }}>לפי תקנות מס הכנסה (ניכוי ממשכורת ומשכר עבודה), התשנ"ג–1993</div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, border: "1px solid #000", padding: "2px 6px" }}>0101/130</div>
      </div>

      {/* א. פרטי המעסיק */}
      <Section title="א. פרטי המעסיק">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#f3f4f6" }}>
              <th style={{ border: "1px solid #000", padding: 3, textAlign: "right" }}>שם המעסיק</th>
              <th style={{ border: "1px solid #000", padding: 3, textAlign: "right" }}>כתובת</th>
              <th style={{ border: "1px solid #000", padding: 3, textAlign: "right" }}>טלפון</th>
              <th style={{ border: "1px solid #000", padding: 3, textAlign: "right" }}>מספר תיק ניכויים</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: "1px solid #000", padding: 4 }}>{employerInfo?.name || "\u00A0"}</td>
              <td style={{ border: "1px solid #000", padding: 4 }}>{employerInfo?.address || "\u00A0"}</td>
              <td style={{ border: "1px solid #000", padding: 4 }}>{employerInfo?.phone || "\u00A0"}</td>
              <td style={{ border: "1px solid #000", padding: 4 }}>{employerInfo?.tax_id || "\u00A0"}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* ב. פרטי העובד */}
      <Section title="ב. פרטי העובד/ת">
        <div>
          <Field label="שם פרטי" value={data.first_name} />
          <Field label="שם משפחה" value={data.last_name} />
          <Field label="מס' זהות (9 ספרות)" value={data.id_number} minWidth={110} />
          <Field label="מס' דרכון" value={data.passport_number} />
        </div>
        <div>
          <Field label="תאריך לידה" value={fmtDate(data.birth_date)} />
          <Field label="תאריך עליה" value={fmtDate(data.aliyah_date)} />
          <Field label="ארץ לידה" value={data.country_of_birth} />
        </div>
        <div>
          <Field label="רחוב" value={data.street} />
          <Field label="מס' בית" value={data.house_number} />
          <Field label="עיר/יישוב" value={data.city} />
          <Field label="מיקוד" value={data.postal_code} />
          <Field label="ת.ד." value={data.po_box} />
        </div>
        <div style={{ marginTop: 4 }}>
          <span style={{ marginInlineEnd: 14 }}>
            <b>מין:</b> <CB on={data.gender === "male"} /> זכר &nbsp; <CB on={data.gender === "female"} /> נקבה
          </span>
          <span>
            <b>מצב משפחתי:</b>
            <span style={{ marginInlineStart: 6 }}><CB on={data.marital_status === "single"} /> רווק/ה</span>
            <span style={{ marginInlineStart: 6 }}><CB on={data.marital_status === "married"} /> נשוי/אה</span>
            <span style={{ marginInlineStart: 6 }}><CB on={data.marital_status === "divorced"} /> גרוש/ה</span>
            <span style={{ marginInlineStart: 6 }}><CB on={data.marital_status === "widowed"} /> אלמן/ה</span>
            <span style={{ marginInlineStart: 6 }}><CB on={data.marital_status === "separated"} /> פרוד/ה</span>
          </span>
        </div>
        <div style={{ marginTop: 3 }}>
          <b>תושב/ת ישראל:</b> <CB on={data.is_israeli_resident} /> כן &nbsp; <CB on={!data.is_israeli_resident} /> לא
        </div>
        <div style={{ marginTop: 3 }}>
          <b>חבר קיבוץ / מושב שיתופי:</b>
          <span style={{ marginInlineStart: 6 }}><CB on={data.kibbutz_member === "no"} /> לא</span>
          <span style={{ marginInlineStart: 6 }}><CB on={data.kibbutz_member === "yes_transferred"} /> כן, ההכנסות מועברות לקיבוץ</span>
          <span style={{ marginInlineStart: 6 }}><CB on={data.kibbutz_member === "yes_not_transferred"} /> כן, ההכנסות אינן מועברות לקיבוץ</span>
        </div>
        <div style={{ marginTop: 3 }}>
          <b>חבר/ה בקופת חולים:</b> <CB on={data.health_fund_member} /> כן, שם הקופה: <u>{data.health_fund_name || "\u00A0\u00A0\u00A0\u00A0"}</u> &nbsp; <CB on={!data.health_fund_member} /> לא
        </div>
        <div style={{ marginTop: 4 }}>
          <Field label="טלפון" value={data.phone} />
          <Field label="נייד" value={data.mobile_phone} />
          <Field label='דוא"ל' value={data.email} minWidth={150} />
        </div>

        {data.marital_status === "married" && (
          <div style={{ marginTop: 6, paddingTop: 4, borderTop: "1px dashed #000" }}>
            <b>פרטי בן/בת זוג:</b>
            <div>
              <Field label="שם פרטי" value={data.spouse_first_name} />
              <Field label="שם משפחה" value={data.spouse_last_name} />
              <Field label="מס' זהות" value={data.spouse_id} />
              <Field label="דרכון" value={data.spouse_passport} />
            </div>
            <div>
              <Field label="תאריך לידה" value={fmtDate(data.spouse_birth_date)} />
              <Field label="תאריך עליה" value={fmtDate(data.spouse_aliyah_date)} />
            </div>
            <div style={{ marginTop: 3 }}>
              <b>הכנסות בן/בת הזוג:</b>
              <span style={{ marginInlineStart: 6 }}><CB on={data.spouse_income_status === "no_income"} /> אין הכנסה</span>
              <span style={{ marginInlineStart: 6 }}>
                <CB on={data.spouse_income_status === "has_income"} /> יש הכנסה מ:
                <span style={{ marginInlineStart: 4 }}><CB on={data.spouse_income_sources.work} /> עבודה</span>
                <span style={{ marginInlineStart: 4 }}><CB on={data.spouse_income_sources.pension} /> קצבה</span>
                <span style={{ marginInlineStart: 4 }}><CB on={data.spouse_income_sources.business} /> עסק</span>
              </span>
              <span style={{ marginInlineStart: 6 }}><CB on={data.spouse_income_status === "other_income"} /> הכנסה אחרת</span>
            </div>
          </div>
        )}
      </Section>

      {/* ג. ילדים */}
      <Section title="ג. פרטי ילדים שטרם מלאו להם 19 שנים">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#f3f4f6" }}>
              <th style={{ border: "1px solid #000", padding: 3, width: 60 }}>בחזקתי</th>
              <th style={{ border: "1px solid #000", padding: 3, width: 80 }}>קצבת ילדים</th>
              <th style={{ border: "1px solid #000", padding: 3 }}>שם הילד/ה</th>
              <th style={{ border: "1px solid #000", padding: 3, width: 110 }}>מס' זהות</th>
              <th style={{ border: "1px solid #000", padding: 3, width: 110 }}>תאריך לידה</th>
            </tr>
          </thead>
          <tbody>
            {(data.dependents.length > 0 ? data.dependents : Array.from({ length: 2 }).map(() => null)).map((d, i) => (
              <tr key={i}>
                <td style={{ border: "1px solid #000", padding: 4, textAlign: "center" }}>{d ? <CB on={d.is_in_custody} /> : "\u00A0"}</td>
                <td style={{ border: "1px solid #000", padding: 4, textAlign: "center" }}>{d ? <CB on={d.receives_allowance} /> : "\u00A0"}</td>
                <td style={{ border: "1px solid #000", padding: 4 }}>{d?.full_name || "\u00A0"}</td>
                <td style={{ border: "1px solid #000", padding: 4 }}>{d?.id_number || "\u00A0"}</td>
                <td style={{ border: "1px solid #000", padding: 4 }}>{d ? fmtDate(d.birth_date) : "\u00A0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ד. הכנסות */}
      <Section title="ד. פרטים על הכנסותיי ממעסיק זה">
        <div>
          {incomeBox("monthly", "(2) משכורת חודש")}
          {incomeBox("monthly_additional", "(3) משכורת בעד משרה נוספת")}
          {incomeBox("partial", "(4) משכורת חלקית")}
        </div>
        <div>
          {incomeBox("daily", "(5) שכר עבודה (עובד יומי)")}
          {incomeBox("pension", "(6) קצבה")}
          {incomeBox("scholarship", "(1) מלגה")}
          {incomeBox("retirement_grant", "מענק פרישה")}
        </div>
        <div style={{ marginTop: 4 }}>
          <Field label="תאריך תחילת עבודה בשנת המס" value={fmtDate(data.job_start_date)} />
        </div>
      </Section>

      {/* ח. פטור / זיכוי — דף 2 */}
      <Section title="ח. אני מבקש/ת פטור או זיכוי ממס מהסיבות הבאות (סמן/י את הסעיפים הרלוונטיים)" pageBreak>
        <div><CB on={tc.israeli_resident} /> 1. אני תושב/ת ישראל</div>
        <div>
          <CB on={tc.blind_or_disabled} /> 2א. אני נכה 100% / עיוור/ת לצמיתות
          {tc.blind_or_disabled && tc.blind_or_disabled_period_at_least_year && <span style={{ marginInlineStart: 8 }}>(תקופה של לפחות 185 יום)</span>}
        </div>
        <div><CB on={tc.disability_compensation_recipient} /> 2ב. אני מקבל/ת תגמול חודשי לפי חוק הנכים</div>
        <div>
          <CB on={tc.settlement_eligible} /> 3. אני תושב/ת קבע ביישוב מזכה
          {tc.settlement_eligible && <span style={{ marginInlineStart: 8 }}>מתאריך: <u>{fmtDate(tc.settlement_start_date)}</u></span>}
        </div>
        <div>
          <CB on={tc.new_immigrant} /> 4. אני עולה חדש/ה (זיכוי לתקופה של עד 3.5 שנים מיום העלייה)
          {tc.new_immigrant && tc.new_immigrant_started_after_aliyah && <span style={{ marginInlineStart: 8 }}>(תחילת העבודה לאחר תאריך העלייה)</span>}
        </div>
        <div><CB on={tc.single_parent_no_spouse_income} /> 5. בגין בן/בת זוג ללא הכנסות בשנת המס</div>
        <div><CB on={tc.single_parent_with_spouse_income} /> 6. אני הורה במשפחה חד-הורית</div>

        <div style={{ marginTop: 3 }}>
          <CB on={tc.children_in_custody} /> 7. בגין ילדיי שבחזקתי המפורטים בחלק ג':
          {tc.children_in_custody && (
            <div style={{ marginInlineStart: 16, marginTop: 2 }}>
              נולדו: <u>{tc.children_in_custody_born_this_year || "\u00A0"}</u> &nbsp;|&nbsp;
              בני 1: <u>{tc.children_in_custody_age_1 || "\u00A0"}</u> &nbsp;|&nbsp;
              בני 2–3: <u>{tc.children_in_custody_age_2_to_3 || "\u00A0"}</u> &nbsp;|&nbsp;
              בני 4–5: <u>{tc.children_in_custody_age_4_to_5 || "\u00A0"}</u> &nbsp;|&nbsp;
              בני 6–17: <u>{tc.children_in_custody_age_6_to_17 || "\u00A0"}</u> &nbsp;|&nbsp;
              בני 18: <u>{tc.children_in_custody_age_18 || "\u00A0"}</u>
            </div>
          )}
        </div>

        <div style={{ marginTop: 3 }}>
          <CB on={tc.children_not_in_custody} /> 8. בגין ילדיי שאינם בחזקתי:
          {tc.children_not_in_custody && (
            <div style={{ marginInlineStart: 16, marginTop: 2 }}>
              נולדו: <u>{tc.children_not_in_custody_born_this_year || "\u00A0"}</u> &nbsp;|&nbsp;
              בני 1: <u>{tc.children_not_in_custody_age_1 || "\u00A0"}</u> &nbsp;|&nbsp;
              בני 2–3: <u>{tc.children_not_in_custody_age_2_to_3 || "\u00A0"}</u> &nbsp;|&nbsp;
              בני 4–5: <u>{tc.children_not_in_custody_age_4_to_5 || "\u00A0"}</u> &nbsp;|&nbsp;
              בני 6–17: <u>{tc.children_not_in_custody_age_6_to_17 || "\u00A0"}</u> &nbsp;|&nbsp;
              בני 18: <u>{tc.children_not_in_custody_age_18 || "\u00A0"}</u>
            </div>
          )}
        </div>

        <div><CB on={tc.single_parent} /> 9. אני הורה יחיד</div>
        <div><CB on={tc.children_with_alimony} /> 10. בגין ילדיי שאינם בחזקתי, אך אני משתתף/ת בכלכלתם</div>
        <div><CB on={tc.parent_to_disabled_child} /> 11. אני הורה לילד עם מוגבלות (זכאי/ת לגמלת ילד נכה)</div>
        <div><CB on={tc.alimony_to_ex_spouse} /> 12. בגין מזונות שאני משלם/ת לבן/בת זוג לשעבר</div>
        <div>
          <CB on={tc.child_aged_16_to_18} /> 13. יש לי ילדים בני 16–18 בשנת המס
          {tc.child_aged_16_to_18 && <span style={{ marginInlineStart: 8 }}>מספר: <u>{tc.child_aged_16_to_18_count || "\u00A0"}</u></span>}
        </div>
        <div>
          <CB on={tc.discharged_soldier} /> 14. אני חייל/ת משוחרר/ת
          {tc.discharged_soldier && (
            <span style={{ marginInlineStart: 8 }}>
              תאריכי שירות: <u>{fmtDate(tc.discharged_soldier_service_start_date)}</u> – <u>{fmtDate(tc.discharged_soldier_service_end_date)}</u>
            </span>
          )}
        </div>
        <div>
          <CB on={tc.academic_degree_completed} /> 15. סיימתי לימודים אקדמיים — מצורף טופס 119
          {tc.academic_degree_completed && <span style={{ marginInlineStart: 8 }}>תאריך סיום: <u>{fmtDate(tc.academic_degree_end_date)}</u></span>}
        </div>
        <div>
          <CB on={tc.reservist_combat} /> 16. שירתתי כלוחם/ת מילואים
          {tc.reservist_combat && <span style={{ marginInlineStart: 8 }}>מספר ימי שירות: <u>{tc.reservist_combat_days || "\u00A0"}</u></span>}
        </div>
      </Section>

      {/* ט. תיאום מס */}
      <Section title="ט. אני מבקש/ת תיאום מס מהסיבות הבאות">
        <div><CB on={co.no_income_until_start} /> 1. לא היתה לי הכנסה מתחילת שנת המס ועד תחילת עבודתי אצל מעסיק זה</div>
        <div><CB on={co.has_additional_employers} /> 2. יש לי הכנסות נוספות ממשכורת / קצבה:</div>
        {co.has_additional_employers && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginTop: 4 }}>
            <thead>
              <tr style={{ background: "#f3f4f6" }}>
                <th style={{ border: "1px solid #000", padding: 3 }}>שם המעסיק</th>
                <th style={{ border: "1px solid #000", padding: 3 }}>כתובת</th>
                <th style={{ border: "1px solid #000", padding: 3 }}>סוג ההכנסה</th>
                <th style={{ border: "1px solid #000", padding: 3 }}>הכנסה חודשית</th>
                <th style={{ border: "1px solid #000", padding: 3 }}>מס שנוכה (%)</th>
              </tr>
            </thead>
            <tbody>
              {(co.additional_employers.length > 0 ? co.additional_employers : Array.from({ length: 2 }).map(() => null)).map((e, i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid #000", padding: 4 }}>{e?.employer_name || "\u00A0"}</td>
                  <td style={{ border: "1px solid #000", padding: 4 }}>{e?.employer_address || "\u00A0"}</td>
                  <td style={{ border: "1px solid #000", padding: 4 }}>{e?.income_type || "\u00A0"}</td>
                  <td style={{ border: "1px solid #000", padding: 4 }}>{e?.monthly_gross || "\u00A0"}</td>
                  <td style={{ border: "1px solid #000", padding: 4 }}>{e?.tax_withheld_percent || "\u00A0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 4 }}><CB on={co.assessor_approval} /> 3. פקיד השומה אישר תיאום מס (אישור מצורף)</div>
      </Section>

      {data.notes && (
        <Section title="הערות">
          <div style={{ whiteSpace: "pre-wrap" }}>{data.notes}</div>
        </Section>
      )}

      {/* י. הצהרה */}
      <div style={{ marginTop: 12, border: "1px solid #000", padding: 8, fontSize: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>י. הצהרה</div>
        <div>
          אני מצהיר/ה כי הפרטים שמסרתי בטופס זה הם נכונים, מלאים ומדויקים. ידוע לי כי מסירת פרטים לא נכונים או העלמת מידע מהווה עבירה לפי פקודת מס הכנסה.
          אני מתחייב/ת להודיע למעסיק על כל שינוי בפרטים שלעיל בתוך שבעה ימים ממועד השינוי.
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16 }}>
          <div>
            <div style={{ borderTop: "1px solid #000", paddingTop: 2, minWidth: 160 }}>תאריך: {new Date().toLocaleDateString("en-GB")}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <SignatureImg signatureRef={signatureRef} />
            <div style={{ borderTop: "1px solid #000", paddingTop: 2, minWidth: 200 }}>חתימת המבקש/ת</div>
          </div>
        </div>
      </div>
    </div>
  );
});
Tax101Preview.displayName = "Tax101Preview";

const SignatureImg = ({ signatureRef }: { signatureRef: React.RefObject<SignaturePadHandle> }) => {
  const url = signatureRef.current?.getDataUrl();
  return url ? <img src={url} alt="signature" style={{ maxHeight: 60, maxWidth: 200 }} /> : <div style={{ height: 60 }} />;
};

import { useEffect, useMemo, useRef, useState, forwardRef } from "react";
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

const PrefilledBadge = () => (
  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal opacity-70">
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
}

const STEPS = [
  "פרטים אישיים",
  "כתובת ומצב משפחתי",
  "ילדים",
  "הכנסות וזיכויים",
  "תיאום מס",
  "חתימה",
];

export function Tax101Dialog({ open, onOpenChange, formId, taxYear, employee, onSuccess, isTokenFlow }: Props) {
  const { toast } = useToast();
  const submit = useSubmitTax101();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Tax101FormData>(() => emptyForm(employee));
  const [submitting, setSubmitting] = useState(false);
  const [employerInfo, setEmployerInfo] = useState<{ name: string; tax_id: string; address?: string; phone?: string } | null>(null);
  const sigRef = useRef<SignaturePadHandle>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Load employer (sub_employer if set, else company) for the PDF
  useEffect(() => {
    if (!open || !employee) return;
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
  }, [open, employee]);

  const draftKey = `tax101-draft-${formId}`;

  // Load draft / employee data on open
  useEffect(() => {
    if (!open) return;
    setStep(0);
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

  const update = <K extends keyof Tax101FormData>(k: K, v: Tax101FormData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

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

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!data.first_name || !data.last_name) return "יש להזין שם פרטי ושם משפחה";
      if (!data.id_number && !data.passport_number) return "יש להזין תעודת זהות או מספר דרכון";
      if (data.id_number && !/^\d{9}$/.test(data.id_number)) return "תעודת זהות לא תקינה (9 ספרות)";
      if (!data.gender) return "יש לבחור מין";
      if (!data.birth_date) return "יש להזין תאריך לידה";
    }
    if (step === 1) {
      if (!data.city || !data.street) return "יש למלא כתובת מלאה";
      if (!data.marital_status) return "יש לבחור מצב משפחתי";
      if (data.health_fund_member && !data.health_fund_name) return "יש לבחור שם קופת חולים";
      if (!data.kibbutz_member) return "יש לבחור סטטוס חבר קיבוץ/מושב שיתופי";
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) {
      toast({ title: "חסרים שדות", description: err, variant: "destructive" });
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
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
        const { error } = await supabase
          .from("tax_form_101" as any)
          .update({
            form_data: data,
            signature_data: sig,
            pdf_url: pdfUrl,
            status: "signed",
            signed_at: new Date().toISOString(),
          })
          .eq("id", formId);
        if (error) throw error;
        // Best-effort activity log via the edge function path (anon can't insert into activity_log)
        try {
          await supabase.functions.invoke("send-tax101-email", { body: { form_id: formId, log_activity: true } });
        } catch {
          await supabase.functions.invoke("send-tax101-email", { body: { form_id: formId } });
        }
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

  const today = new Date().toLocaleDateString("he-IL");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            טופס 101 לשנת {taxYear}
          </DialogTitle>
          <DialogDescription>
            מלא את הפרטים. מה שכבר קיים אצלנו מולא עבורך — אפשר לערוך כל שדה.
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="flex items-center gap-1 mb-2">
          {STEPS.map((label, i) => (
            <div key={i} className="flex-1">
              <div className={`h-1.5 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />
              <p className={`text-[10px] mt-1 text-center ${i === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {label}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-4 py-2">
          {/* Step 0: Personal */}
          {step === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">שם פרטי {employee?.full_name && <PrefilledBadge />}</Label>
                <Input value={data.first_name} onChange={(e) => update("first_name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">שם משפחה {employee?.full_name && <PrefilledBadge />}</Label>
                <Input value={data.last_name} onChange={(e) => update("last_name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">תעודת זהות (9 ספרות) {employee?.id_number && <PrefilledBadge />}</Label>
                <Input value={data.id_number} onChange={(e) => update("id_number", e.target.value)} maxLength={9} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>מספר דרכון <span className="text-muted-foreground text-xs">(למי שאין מס' זהות)</span></Label>
                <Input value={data.passport_number} onChange={(e) => update("passport_number", e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">מין {employee?.gender && <PrefilledBadge />}</Label>
                <select className="w-full h-10 px-3 rounded-md bg-background border border-input" value={data.gender} onChange={(e) => update("gender", e.target.value as any)}>
                  <option value="">בחר...</option>
                  <option value="male">זכר</option>
                  <option value="female">נקבה</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">תאריך לידה {employee?.birth_date && <PrefilledBadge />}</Label>
                <Input type="date" value={data.birth_date} onChange={(e) => update("birth_date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">ארץ לידה {employee?.country_of_birth && <PrefilledBadge />}</Label>
                <Input value={data.country_of_birth} onChange={(e) => update("country_of_birth", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">תאריך עלייה {employee?.aliyah_date && <PrefilledBadge />}</Label>
                <Input type="date" value={data.aliyah_date} onChange={(e) => update("aliyah_date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">טלפון {employee?.phone && <PrefilledBadge />}</Label>
                <Input value={data.phone} onChange={(e) => update("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>טלפון נייד</Label>
                <Input value={data.mobile_phone} onChange={(e) => update("mobile_phone", e.target.value)} />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label className="flex items-center gap-2">אימייל {employee?.email && <PrefilledBadge />}</Label>
                <Input type="email" value={data.email} onChange={(e) => update("email", e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 1: Address + marital */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">כתובת מגורים</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <Label>רחוב</Label>
                  <Input value={data.street} onChange={(e) => update("street", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>מספר בית</Label>
                  <Input value={data.house_number} onChange={(e) => update("house_number", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>עיר</Label>
                  <Input value={data.city} onChange={(e) => update("city", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>מיקוד</Label>
                  <Input value={data.postal_code} onChange={(e) => update("postal_code", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>ת.ד.</Label>
                  <Input value={data.po_box} onChange={(e) => update("po_box", e.target.value)} />
                </div>
              </div>

              <h3 className="text-sm font-semibold text-muted-foreground pt-2">מצב משפחתי</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>מצב משפחתי</Label>
                  <select className="w-full h-10 px-3 rounded-md bg-background border border-input" value={data.marital_status} onChange={(e) => update("marital_status", e.target.value as any)}>
                    <option value="">בחר...</option>
                    <option value="single">רווק/ה</option>
                    <option value="married">נשוי/אה</option>
                    <option value="divorced">גרוש/ה</option>
                    <option value="widowed">אלמן/ה</option>
                    <option value="separated">פרוד/ה</option>
                  </select>
                </div>
                <div className="space-y-1.5 flex items-end gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={data.is_israeli_resident} onCheckedChange={(v) => update("is_israeli_resident", !!v)} />
                    תושב/ת ישראל
                  </label>
                </div>
              </div>

              <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                <Label>חבר/ה בקופת חולים</Label>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="health_fund_member"
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
                      name="health_fund_member"
                      checked={data.health_fund_member}
                      onChange={() => update("health_fund_member", true)}
                    />
                    כן, שם הקופה:
                  </label>
                  {data.health_fund_member && (
                    <select
                      className="h-10 px-3 rounded-md bg-background border border-input text-sm"
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
              </div>

              <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                <Label>חבר קיבוץ / מושב שיתופי</Label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="kibbutz_member"
                      checked={data.kibbutz_member === "no"}
                      onChange={() => update("kibbutz_member", "no")}
                    />
                    לא
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="kibbutz_member"
                      checked={data.kibbutz_member === "yes_transferred"}
                      onChange={() => update("kibbutz_member", "yes_transferred")}
                    />
                    כן — ההכנסות ממעסיק זה מועברות לקיבוץ
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="kibbutz_member"
                      checked={data.kibbutz_member === "yes_not_transferred"}
                      onChange={() => update("kibbutz_member", "yes_not_transferred")}
                    />
                    כן — ההכנסות ממעסיק זה אינן מועברות לקיבוץ
                  </label>
                </div>
              </div>

              {data.marital_status === "married" && (
                <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                  <h4 className="text-sm font-semibold">פרטים על בן/בת הזוג</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>שם משפחה</Label>
                      <Input value={data.spouse_last_name} onChange={(e) => update("spouse_last_name", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>שם פרטי</Label>
                      <Input value={data.spouse_first_name} onChange={(e) => update("spouse_first_name", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>מספר זהות (9 ספרות)</Label>
                      <Input value={data.spouse_id} onChange={(e) => update("spouse_id", e.target.value)} dir="ltr" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>מספר דרכון <span className="text-muted-foreground text-xs">(למי שאין מס' זהות)</span></Label>
                      <Input value={data.spouse_passport} onChange={(e) => update("spouse_passport", e.target.value)} dir="ltr" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>תאריך לידה</Label>
                      <Input type="date" value={data.spouse_birth_date} onChange={(e) => update("spouse_birth_date", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>תאריך עליה</Label>
                      <Input type="date" value={data.spouse_aliyah_date} onChange={(e) => update("spouse_aliyah_date", e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <Label className="text-sm font-semibold">הכנסות בן/בת הזוג</Label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="spouse_income_status"
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
                          name="spouse_income_status"
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
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={data.spouse_income_sources.work}
                              onCheckedChange={(v) => update("spouse_income_sources", { ...data.spouse_income_sources, work: !!v })}
                            />
                            עבודה
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={data.spouse_income_sources.pension}
                              onCheckedChange={(v) => update("spouse_income_sources", { ...data.spouse_income_sources, pension: !!v })}
                            />
                            קצבה
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
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
                          name="spouse_income_status"
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
                  <Plus className="w-3 h-3" /> הוסף ילד/ה
                </Button>
              </div>
              {data.dependents.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">אין ילדים. לחץ "הוסף ילד/ה" אם רלוונטי.</p>
              ) : (
                <div className="space-y-2">
                  {data.dependents.map((dep, i) => (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-3 bg-muted/30 rounded-lg">
                      <div className="md:col-span-4 space-y-1">
                        <Label className="text-xs">שם מלא</Label>
                        <Input value={dep.full_name} onChange={(e) => updateDependent(i, "full_name", e.target.value)} />
                      </div>
                      <div className="md:col-span-3 space-y-1">
                        <Label className="text-xs">ת"ז</Label>
                        <Input value={dep.id_number} onChange={(e) => updateDependent(i, "id_number", e.target.value)} maxLength={9} />
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <Label className="text-xs">תאריך לידה</Label>
                        <Input type="date" value={dep.birth_date} onChange={(e) => updateDependent(i, "birth_date", e.target.value)} />
                      </div>
                      <div className="md:col-span-2 flex flex-col gap-1 text-xs">
                        <label className="flex items-center gap-1">
                          <Checkbox checked={dep.is_in_custody} onCheckedChange={(v) => updateDependent(i, "is_in_custody", !!v)} />
                          בחזקתי
                        </label>
                        <label className="flex items-center gap-1">
                          <Checkbox checked={dep.receives_allowance} onCheckedChange={(v) => updateDependent(i, "receives_allowance", !!v)} />
                          קצבת ילדים
                        </label>
                      </div>
                      <div className="md:col-span-1">
                        <Button size="icon" variant="ghost" onClick={() => removeDependent(i)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
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
                  <Label>ד. סוג ההכנסה ממעסיק זה</Label>
                  <select className="w-full h-10 px-3 rounded-md bg-background border border-input" value={data.income_type} onChange={(e) => update("income_type", e.target.value as any)}>
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
                  <Label className="flex items-center gap-2">תאריך תחילת עבודה בשנת המס {employee?.start_date && <PrefilledBadge />}</Label>
                  <Input type="date" value={data.job_start_date} onChange={(e) => update("job_start_date", e.target.value)} />
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
                  const numInput = (val: number | "", onChange: (v: number | "") => void) => (
                    <Input
                      type="number"
                      min={0}
                      className="h-7 w-16 text-xs"
                      value={val}
                      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  );

                  const ageGrid = (prefix: "in_custody" | "not_in_custody") => {
                    const k = (suf: string) => `children_${prefix}_${suf}` as keyof typeof tc;
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mr-6 mt-2 text-xs">
                        <label className="flex items-center gap-2">
                          נולדו בשנת המס:
                          {numInput(tc[k("born_this_year")] as any, (v) => setTc({ [k("born_this_year")]: v } as any))}
                        </label>
                        <label className="flex items-center gap-2">
                          בני 1:
                          {numInput(tc[k("age_1")] as any, (v) => setTc({ [k("age_1")]: v } as any))}
                        </label>
                        <label className="flex items-center gap-2">
                          בני 2–3:
                          {numInput(tc[k("age_2_to_3")] as any, (v) => setTc({ [k("age_2_to_3")]: v } as any))}
                        </label>
                        <label className="flex items-center gap-2">
                          בני 4–5:
                          {numInput(tc[k("age_4_to_5")] as any, (v) => setTc({ [k("age_4_to_5")]: v } as any))}
                        </label>
                        <label className="flex items-center gap-2">
                          בני 6–17:
                          {numInput(tc[k("age_6_to_17")] as any, (v) => setTc({ [k("age_6_to_17")]: v } as any))}
                        </label>
                        <label className="flex items-center gap-2">
                          בני 18:
                          {numInput(tc[k("age_18")] as any, (v) => setTc({ [k("age_18")]: v } as any))}
                        </label>
                      </div>
                    );
                  };

                  return (
                    <div className="space-y-2 text-sm">
                      <label className="flex items-center gap-2">
                        <Checkbox checked={tc.israeli_resident} onCheckedChange={(v) => setTc({ israeli_resident: !!v })} />
                        1. אני תושב/ת ישראל
                      </label>

                      <div>
                        <label className="flex items-center gap-2">
                          <Checkbox checked={tc.blind_or_disabled} onCheckedChange={(v) => setTc({ blind_or_disabled: !!v })} />
                          2א. אני עיוור/ת או נכה 100% לצמיתות
                        </label>
                        {tc.blind_or_disabled && (
                          <label className="flex items-center gap-2 mr-6 mt-1 text-xs">
                            <Checkbox
                              checked={tc.blind_or_disabled_period_at_least_year}
                              onCheckedChange={(v) => setTc({ blind_or_disabled_period_at_least_year: !!v })}
                            />
                            תקופת הנכות לפחות 185 יום
                          </label>
                        )}
                      </div>

                      <label className="flex items-center gap-2">
                        <Checkbox checked={tc.disability_compensation_recipient} onCheckedChange={(v) => setTc({ disability_compensation_recipient: !!v })} />
                        2ב. אני מקבל/ת תגמול חודשי לפי חוק הנכים
                      </label>

                      <div>
                        <label className="flex items-center gap-2">
                          <Checkbox checked={tc.settlement_eligible} onCheckedChange={(v) => setTc({ settlement_eligible: !!v })} />
                          3. אני תושב/ת קבע ביישוב מזכה
                        </label>
                        {tc.settlement_eligible && (
                          <label className="flex items-center gap-2 mr-6 mt-1 text-xs">
                            מתאריך:
                            <Input
                              type="date"
                              className="h-7 text-xs w-40"
                              value={tc.settlement_start_date}
                              onChange={(e) => setTc({ settlement_start_date: e.target.value })}
                            />
                          </label>
                        )}
                      </div>

                      <div>
                        <label className="flex items-center gap-2">
                          <Checkbox checked={tc.new_immigrant} onCheckedChange={(v) => setTc({ new_immigrant: !!v })} />
                          4. אני עולה חדש/ה (זכאי/ת לזיכוי לתקופה של עד 3.5 שנים מיום העלייה)
                        </label>
                        {tc.new_immigrant && (
                          <label className="flex items-center gap-2 mr-6 mt-1 text-xs">
                            <Checkbox
                              checked={tc.new_immigrant_started_after_aliyah}
                              onCheckedChange={(v) => setTc({ new_immigrant_started_after_aliyah: !!v })}
                            />
                            תאריך תחילת העבודה אחרי תאריך העלייה
                          </label>
                        )}
                      </div>

                      <label className="flex items-center gap-2">
                        <Checkbox checked={tc.single_parent_no_spouse_income} onCheckedChange={(v) => setTc({ single_parent_no_spouse_income: !!v })} />
                        5. בגין בן/בת זוגי שאין לו/לה הכנסות בשנת המס
                      </label>

                      <label className="flex items-center gap-2">
                        <Checkbox checked={tc.single_parent_with_spouse_income} onCheckedChange={(v) => setTc({ single_parent_with_spouse_income: !!v })} />
                        6. אני הורה במשפחה חד-הורית
                      </label>

                      <div>
                        <label className="flex items-center gap-2">
                          <Checkbox checked={tc.children_in_custody} onCheckedChange={(v) => setTc({ children_in_custody: !!v })} />
                          7. בגין ילדיי שבחזקתי המפורטים בחלק ג'
                        </label>
                        {tc.children_in_custody && ageGrid("in_custody")}
                      </div>

                      <div>
                        <label className="flex items-center gap-2">
                          <Checkbox checked={tc.children_not_in_custody} onCheckedChange={(v) => setTc({ children_not_in_custody: !!v })} />
                          8. בגין ילדיי שאינם בחזקתי
                        </label>
                        {tc.children_not_in_custody && ageGrid("not_in_custody")}
                      </div>

                      <label className="flex items-center gap-2">
                        <Checkbox checked={tc.single_parent} onCheckedChange={(v) => setTc({ single_parent: !!v })} />
                        9. אני הורה יחיד
                      </label>

                      <label className="flex items-center gap-2">
                        <Checkbox checked={tc.children_with_alimony} onCheckedChange={(v) => setTc({ children_with_alimony: !!v })} />
                        10. בגין ילדיי שאינם בחזקתי, אך אני משתתף/ת בכלכלתם
                      </label>

                      <label className="flex items-center gap-2">
                        <Checkbox checked={tc.parent_to_disabled_child} onCheckedChange={(v) => setTc({ parent_to_disabled_child: !!v })} />
                        11. אני הורה לילד עם מוגבלות (זכאי/ת לגמלת ילד נכה)
                      </label>

                      <label className="flex items-center gap-2">
                        <Checkbox checked={tc.alimony_to_ex_spouse} onCheckedChange={(v) => setTc({ alimony_to_ex_spouse: !!v })} />
                        12. בגין מזונות שאני משלם/ת לבן/בת זוג לשעבר
                      </label>

                      <div>
                        <label className="flex items-center gap-2">
                          <Checkbox checked={tc.child_aged_16_to_18} onCheckedChange={(v) => setTc({ child_aged_16_to_18: !!v })} />
                          13. יש לי ילדים בני 16–18 בשנת המס
                        </label>
                        {tc.child_aged_16_to_18 && (
                          <label className="flex items-center gap-2 mr-6 mt-1 text-xs">
                            מספר ילדים:
                            {numInput(tc.child_aged_16_to_18_count, (v) => setTc({ child_aged_16_to_18_count: v }))}
                          </label>
                        )}
                      </div>

                      <div>
                        <label className="flex items-center gap-2">
                          <Checkbox checked={tc.discharged_soldier} onCheckedChange={(v) => setTc({ discharged_soldier: !!v })} />
                          14. אני חייל/ת משוחרר/ת
                        </label>
                        {tc.discharged_soldier && (
                          <div className="flex flex-wrap gap-3 mr-6 mt-1 text-xs items-center">
                            <label className="flex items-center gap-2">
                              תאריכי שירות מ:
                              <Input
                                type="date"
                                className="h-7 text-xs w-36"
                                value={tc.discharged_soldier_service_start_date}
                                onChange={(e) => setTc({ discharged_soldier_service_start_date: e.target.value })}
                              />
                            </label>
                            <label className="flex items-center gap-2">
                              עד:
                              <Input
                                type="date"
                                className="h-7 text-xs w-36"
                                value={tc.discharged_soldier_service_end_date}
                                onChange={(e) => setTc({ discharged_soldier_service_end_date: e.target.value })}
                              />
                            </label>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="flex items-center gap-2">
                          <Checkbox checked={tc.academic_degree_completed} onCheckedChange={(v) => setTc({ academic_degree_completed: !!v })} />
                          15. סיימתי לימודים אקדמיים (מצורף טופס 119)
                        </label>
                        {tc.academic_degree_completed && (
                          <label className="flex items-center gap-2 mr-6 mt-1 text-xs">
                            תאריך סיום:
                            <Input
                              type="date"
                              className="h-7 text-xs w-40"
                              value={tc.academic_degree_end_date}
                              onChange={(e) => setTc({ academic_degree_end_date: e.target.value })}
                            />
                          </label>
                        )}
                      </div>

                      <div>
                        <label className="flex items-center gap-2">
                          <Checkbox checked={tc.reservist_combat} onCheckedChange={(v) => setTc({ reservist_combat: !!v })} />
                          16. שירתתי כלוחם/ת מילואים
                        </label>
                        {tc.reservist_combat && (
                          <label className="flex items-center gap-2 mr-6 mt-1 text-xs">
                            מספר ימי שירות:
                            {numInput(tc.reservist_combat_days, (v) => setTc({ reservist_combat_days: v }))}
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-1.5">
                <Label>הערות נוספות</Label>
                <Textarea value={data.notes} onChange={(e) => update("notes", e.target.value)} rows={2} />
              </div>
            </div>
          )}

          {/* Step 4: Section ט — Tax coordination */}
          {step === 4 && (
            <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
              <h4 className="text-sm font-semibold">ט. אני מבקש/ת תיאום מס מהסיבות הבאות</h4>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={data.tax_coordination.no_income_until_start}
                  onCheckedChange={(v) =>
                    update("tax_coordination", { ...data.tax_coordination, no_income_until_start: !!v })
                  }
                />
                1. לא היתה לי הכנסה מתחילת שנת המס ועד תחילת עבודתי אצל מעסיק זה
              </label>

              <div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
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
                          <Label className="text-xs">שם המעסיק</Label>
                          <Input className="h-8 text-xs" value={emp.employer_name} onChange={(e) => updateEmployer(i, "employer_name", e.target.value)} />
                        </div>
                        <div className="md:col-span-3 space-y-1">
                          <Label className="text-xs">כתובת</Label>
                          <Input className="h-8 text-xs" value={emp.employer_address} onChange={(e) => updateEmployer(i, "employer_address", e.target.value)} />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                          <Label className="text-xs">סוג ההכנסה</Label>
                          <Input className="h-8 text-xs" value={emp.income_type} onChange={(e) => updateEmployer(i, "income_type", e.target.value)} />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                          <Label className="text-xs">הכנסה חודשית</Label>
                          <Input
                            type="number"
                            className="h-8 text-xs"
                            value={emp.monthly_gross}
                            onChange={(e) => updateEmployer(i, "monthly_gross", e.target.value === "" ? "" : Number(e.target.value))}
                          />
                        </div>
                        <div className="md:col-span-1 space-y-1">
                          <Label className="text-xs">מס %</Label>
                          <Input
                            type="number"
                            className="h-8 text-xs"
                            value={emp.tax_withheld_percent}
                            onChange={(e) => updateEmployer(i, "tax_withheld_percent", e.target.value === "" ? "" : Number(e.target.value))}
                          />
                        </div>
                        <div className="md:col-span-1">
                          <Button size="icon" variant="ghost" onClick={() => removeEmployer(i)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={addEmployer} className="gap-1">
                      <Plus className="w-3 h-3" /> הוסף מעסיק
                    </Button>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
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
              <div className="p-3 bg-muted/30 rounded-lg text-xs space-y-1">
                <p className="font-semibold">י. הצהרה:</p>
                <p>אני מצהיר/ה כי כל הפרטים שמסרתי בטופס זה הם נכונים ומלאים, וידוע לי כי מסירת פרטים לא נכונים מהווה עבירה לפי פקודת מס הכנסה.</p>
              </div>
              <SignaturePad ref={sigRef} label="חתימת העובד/ת" />
              <p className="text-xs text-muted-foreground">תאריך חתימה: {today}</p>

              <div className="border border-border rounded-lg overflow-hidden" style={{ maxHeight: 400, overflowY: "auto" }}>
                <p className="text-[10px] text-muted-foreground p-2 bg-muted/40">תצוגה מקדימה — תופיע ב-PDF המוגש</p>
                <Tax101Preview ref={previewRef} data={data} taxYear={taxYear} signatureRef={sigRef} employerInfo={employerInfo} />
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <Button variant="outline" onClick={prev} disabled={step === 0 || submitting} className="gap-1">
            <ChevronRight className="w-4 h-4" /> הקודם
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={next} className="gap-1">
              הבא <ChevronLeft className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
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
  const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString("he-IL") : "";
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
            <div style={{ borderTop: "1px solid #000", paddingTop: 2, minWidth: 160 }}>תאריך: {new Date().toLocaleDateString("he-IL")}</div>
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

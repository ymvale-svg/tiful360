import { useEffect, useMemo, useRef, useState } from "react";
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

export interface Tax101FormData {
  // Personal
  first_name: string;
  last_name: string;
  id_number: string;
  gender: "male" | "female" | "";
  birth_date: string;
  country_of_birth: string;
  aliyah_date: string;
  phone: string;
  email: string;
  // Address & marital
  street: string;
  house_number: string;
  city: string;
  postal_code: string;
  po_box: string;
  marital_status: "single" | "married" | "divorced" | "widowed" | "";
  is_israeli_resident: boolean;
  health_fund_member: boolean;
  health_fund_name: string;
  kibbutz_member: "no" | "yes_transferred" | "yes_not_transferred" | "";
  spouse_name: string;
  spouse_id: string;
  spouse_works: boolean;
  // Dependents
  dependents: Dependent[];
  // Income & declarations
  income_type: "monthly" | "partial" | "daily" | "";
  job_start_date: string;
  is_main_income: boolean;
  has_other_income: boolean;
  other_income_details: string;
  exemption_disability: boolean;
  exemption_new_immigrant: boolean;
  exemption_returning_resident: boolean;
  exemption_settlement: boolean;
  notes: string;
}

const emptyForm = (employee?: any): Tax101FormData => {
  const fullName = employee?.full_name ?? "";
  const [first = "", ...rest] = fullName.split(" ");
  return {
    first_name: first,
    last_name: rest.join(" "),
    id_number: employee?.id_number ?? "",
    gender: employee?.gender ?? "",
    birth_date: employee?.birth_date ?? "",
    country_of_birth: employee?.country_of_birth ?? "ישראל",
    aliyah_date: employee?.aliyah_date ?? "",
    phone: employee?.phone ?? "",
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
    spouse_name: "",
    spouse_id: "",
    spouse_works: false,
    dependents: [],
    income_type: "monthly",
    job_start_date: employee?.start_date ?? "",
    is_main_income: true,
    has_other_income: false,
    other_income_details: "",
    exemption_disability: false,
    exemption_new_immigrant: false,
    exemption_returning_resident: false,
    exemption_settlement: false,
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
  "הכנסות והצהרות",
  "חתימה",
];

export function Tax101Dialog({ open, onOpenChange, formId, taxYear, employee, onSuccess, isTokenFlow }: Props) {
  const { toast } = useToast();
  const submit = useSubmitTax101();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Tax101FormData>(() => emptyForm(employee));
  const [submitting, setSubmitting] = useState(false);
  const [employerInfo, setEmployerInfo] = useState<{ name: string; tax_id: string; address?: string } | null>(null);
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
            .select("legal_name, tax_id, address, city")
            .eq("id", employee.sub_employer_id)
            .maybeSingle();
          if (se) {
            setEmployerInfo({
              name: se.legal_name,
              tax_id: se.tax_id,
              address: [se.address, se.city].filter(Boolean).join(", "),
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
          if (c) setEmployerInfo({ name: c.name, tax_id: "", address: "" });
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

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!data.first_name || !data.last_name) return "יש להזין שם פרטי ושם משפחה";
      if (!/^\d{9}$/.test(data.id_number)) return "תעודת זהות לא תקינה (9 ספרות)";
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
      // Wait a tick for preview render
      await new Promise((r) => setTimeout(r, 100));
      const el = previewRef.current;
      if (!el) throw new Error("Preview not ready");

      const path = `${employee?.company_id ?? "anon"}/${formId}-${Date.now()}.pdf`;
      const pdfUrl = await generateAndUploadTax101Pdf(el, path);

      if (isTokenFlow) {
        // Public update by token (RLS allows anon update where status='pending')
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
        await supabase.functions.invoke("send-tax101-email", { body: { form_id: formId } });
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
                <Label className="flex items-center gap-2">תעודת זהות {employee?.id_number && <PrefilledBadge />}</Label>
                <Input value={data.id_number} onChange={(e) => update("id_number", e.target.value)} maxLength={9} />
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
              </div>

              {data.marital_status === "married" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg">
                  <div className="space-y-1.5">
                    <Label>שם בן/בת זוג</Label>
                    <Input value={data.spouse_name} onChange={(e) => update("spouse_name", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ת"ז בן/בת זוג</Label>
                    <Input value={data.spouse_id} onChange={(e) => update("spouse_id", e.target.value)} />
                  </div>
                  <label className="flex items-center gap-2 text-sm md:col-span-2">
                    <Checkbox checked={data.spouse_works} onCheckedChange={(v) => update("spouse_works", !!v)} />
                    בן/בת הזוג עובד/ת
                  </label>
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

          {/* Step 3: Income */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>סוג הכנסה</Label>
                  <select className="w-full h-10 px-3 rounded-md bg-background border border-input" value={data.income_type} onChange={(e) => update("income_type", e.target.value as any)}>
                    <option value="monthly">משכורת חודשית</option>
                    <option value="partial">משרה חלקית</option>
                    <option value="daily">יומי / שעתי</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">תאריך תחילת עבודה {employee?.start_date && <PrefilledBadge />}</Label>
                  <Input type="date" value={data.job_start_date} onChange={(e) => update("job_start_date", e.target.value)} />
                </div>
              </div>

              <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                <h4 className="text-sm font-semibold">הכנסות נוספות</h4>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={data.is_main_income} onCheckedChange={(v) => update("is_main_income", !!v)} />
                  זוהי הכנסתי היחידה / העיקרית
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={data.has_other_income} onCheckedChange={(v) => update("has_other_income", !!v)} />
                  יש לי הכנסות נוספות
                </label>
                {data.has_other_income && (
                  <Textarea
                    placeholder="פירוט הכנסות נוספות..."
                    value={data.other_income_details}
                    onChange={(e) => update("other_income_details", e.target.value)}
                  />
                )}
              </div>

              <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                <h4 className="text-sm font-semibold">בקשת פטור / הקלות מס</h4>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={data.exemption_disability} onCheckedChange={(v) => update("exemption_disability", !!v)} />
                  נכות / עיוורון
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={data.exemption_new_immigrant} onCheckedChange={(v) => update("exemption_new_immigrant", !!v)} />
                  עולה חדש
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={data.exemption_returning_resident} onCheckedChange={(v) => update("exemption_returning_resident", !!v)} />
                  תושב חוזר
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={data.exemption_settlement} onCheckedChange={(v) => update("exemption_settlement", !!v)} />
                  יישוב מזכה
                </label>
              </div>

              <div className="space-y-1.5">
                <Label>הערות נוספות</Label>
                <Textarea value={data.notes} onChange={(e) => update("notes", e.target.value)} rows={2} />
              </div>
            </div>
          )}

          {/* Step 4: Sign */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-lg text-xs space-y-1">
                <p className="font-semibold">הצהרה:</p>
                <p>אני מצהיר/ה כי כל הפרטים שמסרתי בטופס זה הם נכונים ומלאים, וידוע לי כי מסירת פרטים לא נכונים מהווה עבירה לפי פקודת מס הכנסה.</p>
              </div>
              <SignaturePad ref={sigRef} label="חתימת העובד/ת" />
              <p className="text-xs text-muted-foreground">תאריך חתימה: {today}</p>

              {/* Hidden preview for PDF generation */}
              <div className="border border-border rounded-lg overflow-hidden" style={{ maxHeight: 300, overflowY: "auto" }}>
                <p className="text-[10px] text-muted-foreground p-2 bg-muted/40">תצוגה מקדימה</p>
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
// PDF Preview component
// ============================
import { forwardRef } from "react";

const Tax101Preview = forwardRef<HTMLDivElement, { data: Tax101FormData; taxYear: number; signatureRef: React.RefObject<SignaturePadHandle> }>(
  ({ data, taxYear, signatureRef }, ref) => {
    const fieldRow = (label: string, value: any) => (
      <div className="grid grid-cols-3 gap-2 py-1 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-700 col-span-1">{label}</span>
        <span className="text-xs text-gray-900 col-span-2">{value || "—"}</span>
      </div>
    );

    return (
      <div ref={ref} dir="rtl" style={{ background: "#fff", color: "#000", padding: 24, fontFamily: "Arial, sans-serif", width: 800 }}>
        <div style={{ borderBottom: "2px solid #000", paddingBottom: 8, marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>טופס 101 - כרטיס עובד</h1>
          <p style={{ fontSize: 12, color: "#555", margin: "4px 0 0" }}>שנת מס {taxYear}</p>
        </div>

        <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 12, marginBottom: 6, background: "#f3f4f6", padding: "4px 8px" }}>פרטים אישיים</h2>
        {fieldRow("שם מלא", `${data.first_name} ${data.last_name}`)}
        {fieldRow("תעודת זהות", data.id_number)}
        {fieldRow("מין", data.gender === "male" ? "זכר" : data.gender === "female" ? "נקבה" : "—")}
        {fieldRow("תאריך לידה", data.birth_date)}
        {fieldRow("ארץ לידה", data.country_of_birth)}
        {fieldRow("תאריך עלייה", data.aliyah_date)}
        {fieldRow("טלפון", data.phone)}
        {fieldRow("אימייל", data.email)}

        <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 12, marginBottom: 6, background: "#f3f4f6", padding: "4px 8px" }}>כתובת ומצב משפחתי</h2>
        {fieldRow("כתובת", `${data.street} ${data.house_number}, ${data.city} ${data.postal_code}`)}
        {data.po_box && fieldRow("ת.ד.", data.po_box)}
        {fieldRow("מצב משפחתי", { single: "רווק/ה", married: "נשוי/אה", divorced: "גרוש/ה", widowed: "אלמן/ה" }[data.marital_status] || "—")}
        {fieldRow("תושב ישראל", data.is_israeli_resident ? "כן" : "לא")}
        {fieldRow("חבר קופ\"ח", data.health_fund_member ? `כן — ${data.health_fund_name || "—"}` : "לא")}
        {fieldRow("חבר קיבוץ/מושב שיתופי", { no: "לא", yes_transferred: "כן — הכנסות מועברות לקיבוץ", yes_not_transferred: "כן — הכנסות אינן מועברות לקיבוץ" }[data.kibbutz_member] || "—")}
        {data.marital_status === "married" && (
          <>
            {fieldRow("שם בן/בת זוג", data.spouse_name)}
            {fieldRow("ת\"ז בן/בת זוג", data.spouse_id)}
            {fieldRow("בן/בת הזוג עובד/ת", data.spouse_works ? "כן" : "לא")}
          </>
        )}

        {data.dependents.length > 0 && (
          <>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 12, marginBottom: 6, background: "#f3f4f6", padding: "4px 8px" }}>ילדים</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>שם</th>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>ת"ז</th>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>תאריך לידה</th>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>בחזקתי</th>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>קצבה</th>
                </tr>
              </thead>
              <tbody>
                {data.dependents.map((d, i) => (
                  <tr key={i}>
                    <td style={{ border: "1px solid #ccc", padding: 4 }}>{d.full_name}</td>
                    <td style={{ border: "1px solid #ccc", padding: 4 }}>{d.id_number}</td>
                    <td style={{ border: "1px solid #ccc", padding: 4 }}>{d.birth_date}</td>
                    <td style={{ border: "1px solid #ccc", padding: 4, textAlign: "center" }}>{d.is_in_custody ? "✓" : ""}</td>
                    <td style={{ border: "1px solid #ccc", padding: 4, textAlign: "center" }}>{d.receives_allowance ? "✓" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 12, marginBottom: 6, background: "#f3f4f6", padding: "4px 8px" }}>הכנסות והצהרות</h2>
        {fieldRow("סוג הכנסה", { monthly: "משכורת חודשית", partial: "משרה חלקית", daily: "יומי/שעתי" }[data.income_type] || "—")}
        {fieldRow("תאריך תחילת עבודה", data.job_start_date)}
        {fieldRow("הכנסה עיקרית/יחידה", data.is_main_income ? "כן" : "לא")}
        {data.has_other_income && fieldRow("הכנסות נוספות", data.other_income_details)}

        {(data.exemption_disability || data.exemption_new_immigrant || data.exemption_returning_resident || data.exemption_settlement) && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 600 }}>בקשות פטור / הקלות:</p>
            <ul style={{ fontSize: 11, paddingRight: 20, margin: 4 }}>
              {data.exemption_disability && <li>נכות / עיוורון</li>}
              {data.exemption_new_immigrant && <li>עולה חדש</li>}
              {data.exemption_returning_resident && <li>תושב חוזר</li>}
              {data.exemption_settlement && <li>יישוב מזכה</li>}
            </ul>
          </div>
        )}

        {data.notes && (
          <>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 12, marginBottom: 6, background: "#f3f4f6", padding: "4px 8px" }}>הערות</h2>
            <p style={{ fontSize: 12 }}>{data.notes}</p>
          </>
        )}

        <div style={{ marginTop: 24, paddingTop: 12, borderTop: "1px solid #ccc" }}>
          <p style={{ fontSize: 11, fontWeight: 600 }}>הצהרה:</p>
          <p style={{ fontSize: 10, color: "#555" }}>אני מצהיר/ה כי כל הפרטים שמסרתי בטופס זה נכונים ומלאים, וידוע לי כי מסירת פרטים לא נכונים מהווה עבירה לפי פקודת מס הכנסה.</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16 }}>
            <div>
              <p style={{ fontSize: 11, color: "#555" }}>תאריך: {new Date().toLocaleDateString("he-IL")}</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <SignatureImg signatureRef={signatureRef} />
              <p style={{ fontSize: 10, marginTop: 4, borderTop: "1px solid #000", paddingTop: 2, minWidth: 180 }}>חתימת העובד/ת</p>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
Tax101Preview.displayName = "Tax101Preview";

const SignatureImg = ({ signatureRef }: { signatureRef: React.RefObject<SignaturePadHandle> }) => {
  const url = signatureRef.current?.getDataUrl();
  return url ? <img src={url} alt="signature" style={{ maxHeight: 60, maxWidth: 200 }} /> : <div style={{ height: 60 }} />;
};

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileText, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, focusFirstInvalid } from "@/components/feedback/FormField";
import { StateView } from "@/components/feedback/StateView";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { useSaveTax101Settings, useTax101Settings } from "@/hooks/useTax101";
import { DEFAULT_TAX101_SETTINGS, type Tax101Settings } from "@/lib/tax101/prefill";
import type { Tax101IncomeType } from "@/lib/tax101/types";

const INCOME_TYPES: { value: Exclude<Tax101IncomeType, "">; label: string }[] = [
  { value: "monthly", label: "משכורת חודש" },
  { value: "monthly_additional", label: "משכורת בעד משרה נוספת" },
  { value: "partial", label: "משכורת חלקית" },
  { value: "daily", label: "שכר עבודה (עובד יומי)" },
  { value: "pension", label: "קצבה" },
  { value: "scholarship", label: "מלגה" },
];

/** Employee-card fields the form fills automatically; anything missing here the employee must type. */
const EMPLOYEE_FIELDS: { key: string; label: string }[] = [
  { key: "id_number", label: "מספר זהות" },
  { key: "birth_date", label: "תאריך לידה" },
  { key: "gender", label: "מין" },
  { key: "street", label: "רחוב" },
  { key: "city", label: "עיר" },
  { key: "postal_code", label: "מיקוד" },
  { key: "marital_status", label: "מצב משפחתי" },
  { key: "phone", label: "טלפון" },
];

const fileNumberError = (v: string) =>
  v && !/^9\d{8}$/.test(v) ? "מספר תיק ניכויים הוא 9 ספרות שמתחילות ב-9" : null;

/** Payroll → settings: everything the automatic filling of Form 101 needs from the employer. */
export function Tax101SettingsCard() {
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const settingsQ = useTax101Settings(activeCompanyId);
  const save = useSaveTax101Settings();
  const [form, setForm] = useState<Tax101Settings>(DEFAULT_TAX101_SETTINGS);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (settingsQ.data) setForm(settingsQ.data);
  }, [settingsQ.data]);

  const set = <K extends keyof Tax101Settings>(k: K, v: Tax101Settings[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onSave = async () => {
    const err = fileNumberError(form.employer_tax_file_number);
    setFileError(err);
    if (err) {
      focusFirstInvalid(document.getElementById("tax101-settings"));
      return;
    }
    if (!activeCompanyId) return;
    try {
      await save.mutateAsync({ companyId: activeCompanyId, settings: form });
    } catch (e) {
      toast({ title: "ההגדרות לא נשמרו", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      throw e;
    }
  };

  return (
    <div id="tax101-settings" className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <FileText className="w-5 h-5 text-primary" aria-hidden="true" />
        <div>
          <h3 className="font-semibold">הגדרות למילוי טופס 101</h3>
          <p className="text-xs text-muted-foreground">
            הטופס הרשמי ממולא אוטומטית מכרטיס העובד ומהפרטים כאן. עובדים המשויכים למעסיק-משנה מקבלים את פרטי המעסיק-משנה שלהם.
          </p>
        </div>
      </div>

      <StateView loading={settingsQ.isLoading} error={settingsQ.error} onRetry={() => void settingsQ.refetch()} label="הגדרות טופס 101">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">פרטי המעסיק (חלק א׳ בטופס)</legend>
          <FormField label="שם המעסיק" hint="ריק = שם החברה">
            <Input value={form.employer_name} onChange={(e) => set("employer_name", e.target.value)} />
          </FormField>
          <FormField label="כתובת">
            <Input value={form.employer_address} onChange={(e) => set("employer_address", e.target.value)} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="טלפון">
              <Input dir="ltr" inputMode="tel" value={form.employer_phone} onChange={(e) => set("employer_phone", e.target.value)} />
            </FormField>
            <FormField label="מספר תיק ניכויים" error={fileError} hint="9 ספרות, מתחיל ב-9">
              <Input
                dir="ltr"
                inputMode="numeric"
                maxLength={9}
                className="font-mono"
                value={form.employer_tax_file_number}
                onChange={(e) => {
                  set("employer_tax_file_number", e.target.value.replace(/\D/g, "").slice(0, 9));
                  if (fileError) setFileError(null);
                }}
                onBlur={() => setFileError(fileNumberError(form.employer_tax_file_number))}
              />
            </FormField>
          </div>
        </fieldset>

        <fieldset className="space-y-3 pt-2">
          <legend className="text-sm font-semibold">ברירות מחדל ומדיניות</legend>
          <FormField label="סוג ההכנסה שיסומן בחלק ד׳" hint="העובד יכול לשנות בטופס">
            <Select value={form.default_income_type || "monthly"} onValueChange={(v) => set("default_income_type", v as Tax101IncomeType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INCOME_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <SwitchRow
            id="t101-allow-edit"
            label="העובד יכול לתקן שדות שמולאו מהמערכת"
            hint="כבוי: רק שדות חסרים פתוחים לעריכה. שדות עם ערך שגוי נפתחים תמיד."
            checked={form.allow_edit_prefilled}
            onChange={(v) => set("allow_edit_prefilled", v)}
          />
          <SwitchRow
            id="t101-write-back"
            label="עדכון כרטיס העובד לאחר החתימה"
            hint="כתובת, מצב משפחתי, טלפון, קופת חולים והילדים יעודכנו בכרטיס העובד לפי הטופס החתום."
            checked={form.write_back_to_employee}
            onChange={(v) => set("write_back_to_employee", v)}
          />
        </fieldset>

        <Button className="gap-1.5" onClick={onSave} loading={save.isPending} loadingText="שומר…" successText="נשמר">
          <Save className="w-4 h-4" aria-hidden="true" />
          שמור הגדרות
        </Button>
      </StateView>

      <MissingEmployeeData companyId={activeCompanyId} />
    </div>
  );
}

function SwitchRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-hint`} />
    </div>
  );
}

type EmployeeRow = Record<string, string | null> & { id: string; full_name: string };

/** Which active employees will have to type details themselves, so payroll can complete the card first. */
function MissingEmployeeData({ companyId }: { companyId: string | null | undefined }) {
  const q = useQuery({
    queryKey: ["tax101", "missing-employee-data", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(`id, full_name, ${EMPLOYEE_FIELDS.map((f) => f.key).join(", ")}`)
        .eq("company_id", companyId!)
        .in("status", ["active", "onboarding"])
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as EmployeeRow[];
    },
    enabled: !!companyId,
  });

  const rows = useMemo(
    () =>
      (q.data ?? [])
        .map((e) => ({ e, missing: EMPLOYEE_FIELDS.filter((f) => !String(e[f.key] ?? "").trim()).map((f) => f.label) }))
        .filter((r) => r.missing.length > 0),
    [q.data],
  );

  return (
    <section className="space-y-2 border-t pt-4" aria-labelledby="t101-missing-title">
      <h4 id="t101-missing-title" className="text-sm font-semibold">נתונים חסרים בכרטיסי עובדים</h4>
      <StateView loading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} label="נתוני עובדים">
        {rows.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> לכל העובדים הפעילים יש את פרטי הבסיס לטופס.
          </p>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
              {rows.length} עובדים יצטרכו להשלים פרטים בעצמם. אפשר להשלים אותם בכרטיס העובד לפני שליחת הטופס.
            </p>
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
              {rows.map(({ e, missing }) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <Link to={`/employees/${e.id}`} className="font-medium text-primary hover:underline">
                    {e.full_name}
                  </Link>
                  <span className="text-xs text-muted-foreground">חסר: {missing.join(", ")}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </StateView>
    </section>
  );
}

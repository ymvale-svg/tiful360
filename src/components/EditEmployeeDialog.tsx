import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useUpdateEmployee } from "@/hooks/useMutations";
import { useEmployees } from "@/hooks/useData";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldAlert, Mail } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  getHebrewMonthsForYear,
  formatHebrewBirthGematriya,
  formatHebrewYearGematriya,
  parseHebrewYearGematriya,
  parseHebrewDayGematriya,
  formatHebrewDayGematriya,
} from "@/lib/hebrewBirthday";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSubEmployers } from "@/hooks/useSubEmployers";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: any;
}

export function EditEmployeeDialog({ open, onOpenChange, employee }: Props) {
  const { toast } = useToast();
  const update = useUpdateEmployee();
  const { data: allEmployees } = useEmployees();
  const { activeCompanyId, activeCompany } = useCompany();
  const { data: subEmployers = [] } = useSubEmployers(true);
  const queryClient = useQueryClient();
  const { isAdmin, isSuperAdmin } = useAuth();
  const canManageAccess = isAdmin || isSuperAdmin;
  const [form, setForm] = useState<any>({});
  const [hebYearText, setHebYearText] = useState<string>("");
  const [hebDayText, setHebDayText] = useState<string>("");

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
        direct_manager_id: employee.direct_manager_id ?? "",
        sub_employer_id: employee.sub_employer_id ?? "",
        exclude_from_contacts: !!employee.exclude_from_contacts,
        can_remote_punch: !!employee.can_remote_punch,
        birthday_calendar_preference: employee.birthday_calendar_preference ?? "gregorian",
        hebrew_birth_day: employee.hebrew_birth_day ?? "",
        hebrew_birth_month: employee.hebrew_birth_month ?? "",
        hebrew_birth_year: employee.hebrew_birth_year ?? "",
      });
      setHebYearText(employee.hebrew_birth_year ? formatHebrewYearGematriya(employee.hebrew_birth_year) : "");
      setHebDayText(employee.hebrew_birth_day ? formatHebrewDayGematriya(employee.hebrew_birth_day) : "");
    }
  }, [employee, open]);

  const hebYearNum = useMemo(() => parseHebrewYearGematriya(hebYearText), [hebYearText]);
  const hebDayNum = useMemo(() => parseHebrewDayGematriya(hebDayText), [hebDayText]);
  const hebMonthOptions = useMemo(() => getHebrewMonthsForYear(hebYearNum ?? undefined), [hebYearNum]);
  const hebYearInvalid = form.birthday_calendar_preference === "hebrew" && hebYearText.length > 0 && !hebYearNum;
  const hebDayInvalid = form.birthday_calendar_preference === "hebrew" && hebDayText.length > 0 && !hebDayNum;


  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const managerOptions = useMemo(() => {
    const opts = (allEmployees ?? [])
      .filter((e) => e.id !== employee?.id)
      .map((e) => ({ value: e.id, label: `${e.full_name} (${e.role})` }));
    return [{ value: "__none__", label: "ללא מנהל ישיר" }, ...opts];
  }, [allEmployees, employee?.id]);

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId || !employee?.id || !form.email) throw new Error("חסר מייל");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users?action=invite`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            company_id: activeCompanyId,
            role: "employee",
            employees: [{ employee_id: employee.id, email: form.email, full_name: form.full_name }],
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: (data: any) => {
      const r = data?.results?.[0];
      if (r?.status === "failed") {
        toast({ title: "שליחת הזמנה נכשלה", description: r.error, variant: "destructive" });
      } else {
        toast({ title: r?.status === "already_exists" ? "המשתמש כבר קיים — קושר לעובד" : "הזמנה נשלחה" });
      }
      queryClient.invalidateQueries({ queryKey: ["employees-full"] });
      queryClient.invalidateQueries({ queryKey: ["employee", employee?.id] });
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
    },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const handleSave = async () => {
    try {
      const payload: any = { ...form };
      if (!payload.birth_date) delete payload.birth_date;
      if (!payload.email) delete payload.email;
      if (!payload.phone) delete payload.phone;
      if (!payload.direct_manager_id || payload.direct_manager_id === "__none__") {
        payload.direct_manager_id = null;
      }
      if (!payload.sub_employer_id || payload.sub_employer_id === "__main__") {
        payload.sub_employer_id = null;
      }
      // Hebrew birthday fields: only send when preference is hebrew, otherwise clear
      if (payload.birthday_calendar_preference === "hebrew") {
        payload.hebrew_birth_day = hebDayNum ?? null;
        payload.hebrew_birth_month = parseInt(payload.hebrew_birth_month, 10) || null;
        payload.hebrew_birth_year = hebYearNum ?? null;
        if (!payload.hebrew_birth_day || !payload.hebrew_birth_month || !payload.hebrew_birth_year) {
          throw new Error("נא למלא יום, חודש ושנה לתאריך עברי");
        }
      } else {
        payload.hebrew_birth_day = null;
        payload.hebrew_birth_month = null;
        payload.hebrew_birth_year = null;
      }
      await update.mutateAsync({ id: employee.id, ...payload });
      queryClient.invalidateQueries({ queryKey: ["employees-full"] });
      toast({ title: "פרטי העובד נשמרו" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  const hasAccount = !!employee?.linked_user_id;

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
          <div>
            <Label>מנהל ישיר</Label>
            <SearchableSelect
              value={form.direct_manager_id || "__none__"}
              onChange={(v) => set("direct_manager_id", v)}
              options={managerOptions}
              placeholder="בחר מנהל ישיר"
              searchPlaceholder="חפש עובד..."
            />
          </div>
          <div className="md:col-span-2">
            <Label>מעסיק (לטופס 101)</Label>
            <SearchableSelect
              value={form.sub_employer_id || "__main__"}
              onChange={(v) => set("sub_employer_id", v === "__main__" ? "" : v)}
              options={[
                { value: "__main__", label: `החברה הראשית — ${activeCompany?.name ?? ""}` },
                ...subEmployers.map((s) => ({ value: s.id, label: `${s.legal_name} (${s.tax_id})` })),
              ]}
              placeholder="החברה הראשית"
              searchPlaceholder="חפש מעסיק..."
            />
          </div>
          <div className="md:col-span-2 border-t border-border/50 pt-3 mt-1">
            <Label className="mb-2 block">לוח שנה ליום הולדת</Label>
            <RadioGroup
              value={form.birthday_calendar_preference ?? "gregorian"}
              onValueChange={(v) => set("birthday_calendar_preference", v)}
              className="flex gap-4 mb-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="gregorian" id="edit-cal-greg" />
                <Label htmlFor="edit-cal-greg" className="text-sm cursor-pointer">לועזי</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="hebrew" id="edit-cal-heb" />
                <Label htmlFor="edit-cal-heb" className="text-sm cursor-pointer">עברי</Label>
              </div>
            </RadioGroup>
            {form.birthday_calendar_preference === "hebrew" && (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  התאריך העברי נשמר כפי שמוזן ולא מומר מהתאריך הלועזי.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">יום (עברי)</Label>
                    <Input
                      type="text"
                      inputMode="text"
                      value={hebDayText}
                      onChange={(e) => setHebDayText(e.target.value)}
                      placeholder='לדוג׳ כ"ב'
                      aria-invalid={hebDayInvalid}
                    />
                    {hebDayInvalid && (
                      <p className="text-[11px] text-destructive mt-1">יום לא תקין</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">חודש עברי</Label>
                    <Select value={form.hebrew_birth_month ? String(form.hebrew_birth_month) : ""} onValueChange={(v) => set("hebrew_birth_month", v)}>
                      <SelectTrigger><SelectValue placeholder="חודש" /></SelectTrigger>
                      <SelectContent>
                        {hebMonthOptions.map((m) => (
                          <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">שנה (עברית)</Label>
                    <Input
                      type="text"
                      inputMode="text"
                      value={hebYearText}
                      onChange={(e) => setHebYearText(e.target.value)}
                      placeholder='לדוג׳ תשמ"ה'
                      aria-invalid={hebYearInvalid}
                    />
                    {hebYearInvalid && (
                      <p className="text-[11px] text-destructive mt-1">שנה לא תקינה</p>
                    )}
                  </div>
                </div>
                {form.hebrew_birth_day && form.hebrew_birth_month && hebYearNum && (
                  <div className="text-sm mt-2">
                    תצוגה: <span className="font-semibold">{formatHebrewBirthGematriya(
                      parseInt(form.hebrew_birth_day, 10),
                      parseInt(form.hebrew_birth_month, 10),
                      hebYearNum,
                    )}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>


        {canManageAccess && (
        <div className="mt-4 p-3 rounded-lg border border-border bg-muted/30 flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {hasAccount ? (
                <ShieldCheck className="w-4 h-4 text-success" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">גישה למערכת</span>
              {hasAccount && (
                <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[11px]">פעיל</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {hasAccount
                ? "לעובד יש חשבון משתמש פעיל. ניהול תפקידים — בלשונית 'משתמשים ותפקידים'."
                : form.email
                  ? "לעובד אין חשבון משתמש. שלח הזמנה במייל ליצירת חשבון."
                  : "אין כתובת מייל — הוסף מייל ושמור כדי ליצור חשבון."}
            </p>
          </div>
          {!hasAccount && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 shrink-0"
              disabled={!form.email || inviteMutation.isPending}
              onClick={() => inviteMutation.mutate()}
            >
              <Mail className="w-4 h-4" />
              {inviteMutation.isPending ? "שולח..." : "צור חשבון"}
            </Button>
          )}
        </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Checkbox
            id="exclude_from_contacts"
            checked={!!form.exclude_from_contacts}
            onCheckedChange={(v) => set("exclude_from_contacts", !!v)}
          />
          <Label htmlFor="exclude_from_contacts" className="text-sm cursor-pointer">
            אל תכלול ברשימת אנשי הקשר בפורטל
          </Label>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Checkbox
            id="can_remote_punch"
            checked={!!form.can_remote_punch}
            onCheckedChange={(v) => set("can_remote_punch", !!v)}
          />
          <Label htmlFor="can_remote_punch" className="text-sm cursor-pointer">
            מורשה דיווח נוכחות מרחוק (עובד שטח)
          </Label>
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

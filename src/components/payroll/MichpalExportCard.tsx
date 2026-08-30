import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "@/hooks/use-toast";
import { Download, FileDown, AlertTriangle } from "lucide-react";
import {
  buildMichpalCsv,
  downloadMichpalCsv,
  punchesToMichpalRows,
  leavesToMichpalRows,
  DEFAULT_ABSENCE_CODES,
  type MichpalSource,
} from "@/lib/michpalExport";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const SOURCE_LABEL: Record<MichpalSource, string> = {
  clock: "שעון בלבד",
  remote: "החתמה מרחוק בלבד",
  combined: "משולב",
};
const SOURCE_SLUG: Record<MichpalSource, string> = {
  clock: "clock",
  remote: "remote",
  combined: "combined",
};

export function MichpalExportCard() {
  const { activeCompanyId } = useCompany();

  const prevMonth = new Date();
  prevMonth.setDate(1);
  prevMonth.setMonth(prevMonth.getMonth() - 1);

  const [month, setMonth] = useState(
    `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`,
  );
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState(iso(prevMonth));
  const [customTo, setCustomTo] = useState(iso(new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0)));
  const [source, setSource] = useState<MichpalSource>("clock");
  const [includeAbsences, setIncludeAbsences] = useState(false);
  const [department, setDepartment] = useState("all");
  const [employeeId, setEmployeeId] = useState("all");

  const { from, to } = useMemo(() => {
    if (useCustomRange) return { from: customFrom, to: customTo };
    const [y, m] = month.split("-").map(Number);
    return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  }, [useCustomRange, customFrom, customTo, month]);

  const { data: employees = [] } = useQuery({
    queryKey: ["michpal-employees", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, employee_code, department, tracks_attendance")
        .eq("company_id", activeCompanyId)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeCompanyId,
  });

  const { data: absenceCodes = DEFAULT_ABSENCE_CODES } = useQuery({
    queryKey: ["michpal-absence-codes", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return DEFAULT_ABSENCE_CODES;
      const { data } = await supabase
        .from("companies")
        .select("michpal_absence_codes")
        .eq("id", activeCompanyId)
        .maybeSingle();
      const raw = (data as any)?.michpal_absence_codes;
      return { ...DEFAULT_ABSENCE_CODES, ...(raw ?? {}) } as Record<string, string>;
    },
    enabled: !!activeCompanyId,
  });

  const { data: punches = [], isFetching: punchesLoading } = useQuery({
    queryKey: ["michpal-punches", activeCompanyId, from, to],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("attendance_punches")
        .select("employee_id, punch_at, direction, source, status")
        .eq("company_id", activeCompanyId)
        .gte("punch_at", `${from}T00:00:00+03:00`)
        .lte("punch_at", `${to}T23:59:59+03:00`)
        .order("punch_at", { ascending: true })
        .limit(20000);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeCompanyId,
  });

  const { data: leaves = [] } = useQuery({
    queryKey: ["michpal-leaves", activeCompanyId, from, to],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("leave_requests")
        .select("employee_id, request_type, start_date, end_date")
        .eq("company_id", activeCompanyId)
        .eq("status", "approved")
        .lte("start_date", to)
        .or(`end_date.gte.${from},end_date.is.null`);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeCompanyId && includeAbsences,
  });

  const departments = useMemo(
    () => [...new Set(employees.map((e: any) => e.department).filter(Boolean))].sort(),
    [employees],
  );

  const selected = useMemo(
    () =>
      employees.filter((e: any) => {
        if (employeeId !== "all") return e.id === employeeId;
        if (department !== "all") return e.department === department;
        return true;
      }),
    [employees, employeeId, department],
  );

  const codeByEmployee = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of selected as any[]) if (e.employee_code) m.set(e.id, String(e.employee_code));
    return m;
  }, [selected]);

  const missingCodes = useMemo(
    () => (selected as any[]).filter((e) => !e.employee_code && e.tracks_attendance !== false).length,
    [selected],
  );

  const result = useMemo(() => {
    const punchRes = punchesToMichpalRows(punches as any[], codeByEmployee, source);
    const absenceRows = includeAbsences
      ? leavesToMichpalRows(
          (leaves as any[]).filter((l) => codeByEmployee.has(l.employee_id)),
          codeByEmployee,
          absenceCodes,
          from,
          to,
        )
      : [];
    return {
      rows: [...punchRes.rows, ...absenceRows],
      punchRows: punchRes.rows.length,
      absenceRows: absenceRows.length,
      employees: punchRes.employeeIds.size,
      skippedUnknownDirection: punchRes.skippedUnknownDirection,
      skippedNoCode: punchRes.skippedNoCode,
    };
  }, [punches, leaves, codeByEmployee, source, includeAbsences, absenceCodes, from, to]);

  const handleDownload = () => {
    if (result.rows.length === 0) {
      toast({ title: "אין נתונים לייצוא", description: "לא נמצאו שורות בטווח שנבחר", variant: "destructive" });
      return;
    }
    const csv = buildMichpalCsv(result.rows);
    const label = useCustomRange ? `${from}_${to}` : month;
    downloadMichpalCsv(csv, `michpal-${label}-${SOURCE_SLUG[source]}.csv`);
    toast({ title: "הקובץ הורד", description: `${result.rows.length} שורות · ${SOURCE_LABEL[source]}` });
  };

  if (!activeCompanyId) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          <FileDown className="w-4 h-4 text-primary" />
          ייצוא נתוני נוכחות למיכפל
          <Badge variant="outline" className="font-mono text-xs">CSV · Windows-1255</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">מקור הנתונים</label>
            <Select value={source} onValueChange={(v) => setSource(v as MichpalSource)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="clock">שעון בלבד</SelectItem>
                <SelectItem value="remote">החתמה מרחוק בלבד</SelectItem>
                <SelectItem value="combined">משולב</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!useCustomRange ? (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">חודש</label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">מתאריך</label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">עד תאריך</label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
              </div>
            </>
          )}

          <div>
            <label className="text-xs text-muted-foreground block mb-1">מחלקה</label>
            <Select value={department} onValueChange={(v) => { setDepartment(v); setEmployeeId("all"); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל המחלקות</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d as string} value={d as string}>{d as string}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">עובד</label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל העובדים</SelectItem>
                {(department === "all"
                  ? employees
                  : employees.filter((e: any) => e.department === department)
                ).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={useCustomRange} onCheckedChange={(v) => setUseCustomRange(!!v)} />
            טווח תאריכים חופשי
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={includeAbsences} onCheckedChange={(v) => setIncludeAbsences(!!v)} />
            כלול היעדרויות מאושרות (חופשה / מחלה / מילואים)
          </label>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>שורות בקובץ: <strong>{result.rows.length}</strong></span>
            <span>החתמות: <strong>{result.punchRows}</strong></span>
            {includeAbsences && <span>שורות היעדרות: <strong>{result.absenceRows}</strong></span>}
            <span>עובדים: <strong>{result.employees}</strong></span>
          </div>
          {(missingCodes > 0 || result.skippedNoCode > 0 || result.skippedUnknownDirection > 0) && (
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-500 pt-1">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                {missingCodes > 0 && <div>{missingCodes} עובדים ללא קוד עובד — לא ייכללו בקובץ</div>}
                {result.skippedNoCode > 0 && <div>{result.skippedNoCode} החתמות ללא שיוך/קוד עובד הושמטו</div>}
                {result.skippedUnknownDirection > 0 && (
                  <div>{result.skippedUnknownDirection} החתמות ללא כיוון (כניסה/יציאה) הושמטו</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleDownload} disabled={punchesLoading || result.rows.length === 0}>
            <Download className="w-4 h-4 ml-1" />
            הורדת קובץ למיכפל
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { exportToExcel } from "@/lib/exportExcel";
import { CalendarClock, FileSpreadsheet, Search } from "lucide-react";

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const formatIL = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};
const timeIL = (ts: string) =>
  new Date(ts).toLocaleTimeString("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  });
const dayIL = (ts: string) =>
  new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

interface GapRow {
  employee_id: string;
  full_name: string;
  email: string | null;
  gap_date: string;
  gap_type: "empty" | "odd";
  punch_count: number;
  punch_times: string;
}

type Period = "daily" | "monthly";

export function HrAttendanceReports() {
  const { activeCompanyId } = useCompany();
  const today = new Date();

  const [period, setPeriod] = useState<Period>("daily");
  const [day, setDay] = useState(iso(today));
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [statusFilter, setStatusFilter] = useState<"all" | "in" | "out" | "full" | "none">("all");
  const [search, setSearch] = useState("");

  const { from, to } = useMemo(() => {
    if (period === "daily") return { from: day, to: day };
    const [y, m] = month.split("-").map(Number);
    return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  }, [period, day, month]);

  const rangeLabel = period === "daily" ? formatIL(day) : `${formatIL(from)} – ${formatIL(to)}`;

  // Employees tracked for attendance
  const { data: employees = [] } = useQuery({
    queryKey: ["hr-report-employees", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, employee_code, department, tracks_attendance, status")
        .eq("company_id", activeCompanyId)
        .in("status", ["active", "onboarding", "leaving"])
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeCompanyId,
  });

  // Punches in range
  const { data: punches = [], isLoading: punchesLoading, refetch: refetchPunches } = useQuery({
    queryKey: ["hr-report-punches", activeCompanyId, from, to],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("attendance_punches")
        .select("employee_id, punch_at, direction")
        .eq("company_id", activeCompanyId)
        .gte("punch_at", `${from}T00:00:00+00:00`)
        .lte("punch_at", `${to}T23:59:59+00:00`)
        .order("punch_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeCompanyId,
  });

  // Approved leave in range
  const { data: leaves = [] } = useQuery({
    queryKey: ["hr-report-leaves", activeCompanyId, from, to],
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
    enabled: !!activeCompanyId,
  });

  // Gaps (missing punches) in range
  const { data: gaps = [], isLoading: gapsLoading, refetch: refetchGaps } = useQuery<GapRow[]>({
    queryKey: ["hr-report-gaps", activeCompanyId, from, to],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase.rpc("get_attendance_gaps" as any, {
        _company_id: activeCompanyId,
        _from: from,
        _to: to,
      });
      if (error) throw error;
      return (data ?? []) as GapRow[];
    },
    enabled: !!activeCompanyId,
  });

  const tracked = useMemo(
    () => employees.filter((e: any) => e.tracks_attendance !== false),
    [employees],
  );

  const leaveByEmployee = useMemo(() => {
    const map = new Map<string, string>();
    const labels: Record<string, string> = {
      vacation: "חופשה", sick: "מחלה", reserve: "מילואים", personal: "יום אישי", other: "היעדרות",
    };
    for (const l of leaves as any[]) {
      if (l.employee_id) map.set(l.employee_id, labels[l.request_type] ?? "היעדרות");
    }
    return map;
  }, [leaves]);

  // Daily rows: first-in / last-out per employee
  const dailyRows = useMemo(() => {
    const byEmp = new Map<string, { in?: string; out?: string; count: number }>();
    for (const p of punches as any[]) {
      if (!p.employee_id) continue;
      const cur = byEmp.get(p.employee_id) ?? { count: 0 };
      cur.count++;
      if (p.direction === "out") cur.out = p.punch_at;
      else if (!cur.in) cur.in = p.punch_at;
      if (p.direction !== "out" && !cur.out) cur.out = undefined;
      byEmp.set(p.employee_id, cur);
    }
    return tracked.map((e: any) => {
      const rec = byEmp.get(e.id);
      const hasIn = !!rec?.in;
      const hasOut = !!rec?.out;
      const state: "full" | "in" | "out" | "none" =
        hasIn && hasOut ? "full" : hasIn ? "in" : hasOut ? "out" : "none";
      return {
        id: e.id,
        full_name: e.full_name,
        employee_code: e.employee_code,
        department: e.department,
        check_in: rec?.in ? timeIL(rec.in) : "",
        check_out: rec?.out ? timeIL(rec.out) : "",
        punch_count: rec?.count ?? 0,
        state,
        leave: leaveByEmployee.get(e.id) ?? "",
      };
    });
  }, [tracked, punches, leaveByEmployee]);

  // Monthly rows: aggregated per employee
  const monthlyRows = useMemo(() => {
    const byEmp = new Map<string, { days: Set<string>; count: number }>();
    for (const p of punches as any[]) {
      if (!p.employee_id) continue;
      const cur = byEmp.get(p.employee_id) ?? { days: new Set<string>(), count: 0 };
      cur.days.add(dayIL(p.punch_at));
      cur.count++;
      byEmp.set(p.employee_id, cur);
    }
    const gapDays = new Map<string, number>();
    for (const g of gaps) gapDays.set(g.employee_id, (gapDays.get(g.employee_id) ?? 0) + 1);
    return tracked.map((e: any) => {
      const rec = byEmp.get(e.id);
      return {
        id: e.id,
        full_name: e.full_name,
        employee_code: e.employee_code,
        department: e.department,
        present_days: rec?.days.size ?? 0,
        punch_count: rec?.count ?? 0,
        gap_days: gapDays.get(e.id) ?? 0,
        state: (rec?.days.size ?? 0) > 0 ? ("full" as const) : ("none" as const),
        leave: leaveByEmployee.get(e.id) ?? "",
      };
    });
  }, [tracked, punches, gaps, leaveByEmployee]);

  const matchesSearch = (r: { full_name: string; employee_code?: string; department?: string }) => {
    const q = search.trim();
    if (!q) return true;
    return [r.full_name, r.employee_code, r.department].some((v) => String(v ?? "").includes(q));
  };

  const visibleDaily = dailyRows.filter(
    (r) => matchesSearch(r) && (statusFilter === "all" || r.state === statusFilter),
  );
  const visibleMonthly = monthlyRows.filter((r) => matchesSearch(r));

  const counts = useMemo(() => ({
    total: dailyRows.length,
    full: dailyRows.filter((r) => r.state === "full").length,
    inOnly: dailyRows.filter((r) => r.state === "in").length,
    outOnly: dailyRows.filter((r) => r.state === "out").length,
    none: dailyRows.filter((r) => r.state === "none").length,
  }), [dailyRows]);

  const stateLabel: Record<string, string> = {
    full: "כניסה ויציאה",
    in: "כניסה בלבד",
    out: "יציאה בלבד",
    none: "לא החתים",
  };

  const exportAttendance = () => {
    if (period === "daily") {
      exportToExcel(
        visibleDaily.map((r) => ({ ...r, state: stateLabel[r.state] })),
        [
          { key: "full_name", label: "שם עובד" },
          { key: "employee_code", label: "מס' עובד" },
          { key: "department", label: "מחלקה" },
          { key: "check_in", label: "כניסה" },
          { key: "check_out", label: "יציאה" },
          { key: "punch_count", label: "מס' החתמות" },
          { key: "state", label: "סטטוס" },
          { key: "leave", label: "היעדרות מאושרת" },
        ],
        `דוח_נוכחות_יומי_${from}`,
      );
    } else {
      exportToExcel(
        visibleMonthly,
        [
          { key: "full_name", label: "שם עובד" },
          { key: "employee_code", label: "מס' עובד" },
          { key: "department", label: "מחלקה" },
          { key: "present_days", label: "ימי נוכחות" },
          { key: "punch_count", label: "סה\"כ החתמות" },
          { key: "gap_days", label: "ימי חוסר" },
          { key: "leave", label: "היעדרות מאושרת" },
        ],
        `דוח_נוכחות_חודשי_${from}_עד_${to}`,
      );
    }
  };

  const exportGaps = () => {
    exportToExcel(
      gaps.map((g) => ({
        full_name: g.full_name,
        date: formatIL(g.gap_date),
        weekday: WEEKDAYS[new Date(g.gap_date).getDay()],
        type: g.gap_type === "empty" ? "יום ללא החתמות" : "החתמה אי-זוגית",
        count: g.punch_count,
        times: g.punch_times ?? "",
      })),
      [
        { key: "full_name", label: "שם עובד" },
        { key: "date", label: "תאריך" },
        { key: "weekday", label: "יום" },
        { key: "type", label: "סוג חוסר" },
        { key: "count", label: "מס' החתמות" },
        { key: "times", label: "החתמות שבוצעו" },
      ],
      period === "daily" ? `דוח_חוסרים_יומי_${from}` : `דוח_חוסרים_חודשי_${from}_עד_${to}`,
    );
  };

  if (!activeCompanyId) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          דוחות נוכחות וחוסרים
          <Badge variant="outline" className="font-mono">{rangeLabel}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">תקופה</label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">יומי</SelectItem>
                <SelectItem value="monthly">חודשי</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === "daily" ? (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">תאריך</label>
              <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-40" />
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">חודש</label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
            </div>
          )}
          <div className="min-w-[10rem] flex-1">
            <label className="text-xs text-muted-foreground block mb-1">חיפוש עובד</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute top-2.5 right-2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pr-8" placeholder="שם / מס' עובד / מחלקה" />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => { refetchPunches(); refetchGaps(); }}>
            רענון
          </Button>
        </div>

        <Tabs defaultValue="attendance" dir="rtl">
          <TabsList>
            <TabsTrigger value="attendance">נוכחות</TabsTrigger>
            <TabsTrigger value="gaps">חוסרי החתמה {gaps.length > 0 && `(${gaps.length})`}</TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="space-y-3">
            {period === "daily" && (
              <div className="flex flex-wrap gap-2">
                {([
                  ["all", `הכל (${counts.total})`],
                  ["full", `כניסה ויציאה (${counts.full})`],
                  ["in", `כניסה בלבד (${counts.inOnly})`],
                  ["out", `יציאה בלבד (${counts.outOnly})`],
                  ["none", `לא החתימו (${counts.none})`],
                ] as const).map(([key, label]) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={statusFilter === key ? "default" : "outline"}
                    onClick={() => setStatusFilter(key as any)}
                  >
                    {label}
                  </Button>
                ))}
                <div className="flex-1" />
                <Button size="sm" variant="outline" onClick={exportAttendance}>
                  <FileSpreadsheet className="w-4 h-4 ml-1" />ייצא לאקסל
                </Button>
              </div>
            )}
            {period === "monthly" && (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={exportAttendance}>
                  <FileSpreadsheet className="w-4 h-4 ml-1" />ייצא לאקסל
                </Button>
              </div>
            )}

            {punchesLoading ? (
              <div className="py-10 text-center text-muted-foreground">טוען…</div>
            ) : period === "daily" ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="p-2 text-right">עובד</th>
                      <th className="p-2 text-right">מחלקה</th>
                      <th className="p-2 text-right">כניסה</th>
                      <th className="p-2 text-right">יציאה</th>
                      <th className="p-2 text-right">סטטוס</th>
                      <th className="p-2 text-right">היעדרות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDaily.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">אין נתונים</td></tr>
                    ) : visibleDaily.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-muted/30">
                        <td className="p-2 font-medium">{r.full_name}</td>
                        <td className="p-2 text-xs text-muted-foreground">{r.department}</td>
                        <td className="p-2 font-mono">{r.check_in || "—"}</td>
                        <td className="p-2 font-mono">{r.check_out || "—"}</td>
                        <td className="p-2">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                            r.state === "full" ? "bg-success/10 text-success"
                              : r.state === "none" ? "bg-destructive/10 text-destructive"
                              : "bg-warning/10 text-warning"
                          }`}>
                            {stateLabel[r.state]}
                          </span>
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">{r.leave || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="p-2 text-right">עובד</th>
                      <th className="p-2 text-right">מחלקה</th>
                      <th className="p-2 text-right">ימי נוכחות</th>
                      <th className="p-2 text-right">סה"כ החתמות</th>
                      <th className="p-2 text-right">ימי חוסר</th>
                      <th className="p-2 text-right">היעדרות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMonthly.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">אין נתונים</td></tr>
                    ) : visibleMonthly.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-muted/30">
                        <td className="p-2 font-medium">{r.full_name}</td>
                        <td className="p-2 text-xs text-muted-foreground">{r.department}</td>
                        <td className="p-2 font-mono">{r.present_days}</td>
                        <td className="p-2 font-mono">{r.punch_count}</td>
                        <td className="p-2 font-mono">
                          {r.gap_days > 0
                            ? <span className="text-destructive">{r.gap_days}</span>
                            : <span className="text-muted-foreground">0</span>}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">{r.leave || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="gaps" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={exportGaps} disabled={!gaps.length}>
                <FileSpreadsheet className="w-4 h-4 ml-1" />ייצא לאקסל
              </Button>
            </div>
            {gapsLoading ? (
              <div className="py-10 text-center text-muted-foreground">טוען…</div>
            ) : gaps.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">אין חוסרי החתמה בטווח הנבחר 🎉</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="p-2 text-right">עובד</th>
                      <th className="p-2 text-right">תאריך</th>
                      <th className="p-2 text-right">יום</th>
                      <th className="p-2 text-right">סוג חוסר</th>
                      <th className="p-2 text-right">החתמות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaps
                      .filter((g) => matchesSearch({ full_name: g.full_name }))
                      .map((g) => (
                        <tr key={`${g.employee_id}-${g.gap_date}`} className="border-b hover:bg-muted/30">
                          <td className="p-2 font-medium">{g.full_name}</td>
                          <td className="p-2 font-mono">{formatIL(g.gap_date)}</td>
                          <td className="p-2 text-xs text-muted-foreground">{WEEKDAYS[new Date(g.gap_date).getDay()]}</td>
                          <td className="p-2">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                              g.gap_type === "empty" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                            }`}>
                              {g.gap_type === "empty" ? "יום ללא החתמות" : "החתמה אי-זוגית"}
                            </span>
                          </td>
                          <td className="p-2 font-mono text-xs">{g.punch_times || "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

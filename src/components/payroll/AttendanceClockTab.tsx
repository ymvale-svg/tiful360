import { useMemo, useState } from "react";
import { useEmployees } from "@/hooks/useData";
import {
  useEmployeePunches,
  useOrphanPunches,
  useMonthlyPunchStats,
  useUpdatePunchStatus,
  useAssignPunchEmployee,
  useUpdatePunch,
  type AttendancePunch,
} from "@/hooks/useAttendancePunches";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Clock4, AlertTriangle, UserPlus2 } from "lucide-react";
import { AttendanceFlowIndicator } from "./AttendanceFlowIndicator";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";

const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

const STATUS_LABEL: Record<string, string> = {
  pending: "ממתין", approved: "מאושר", rejected: "נדחה",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline", approved: "default", rejected: "destructive",
};
const DIR_LABEL: Record<string, string> = { in: "כניסה", out: "יציאה", unknown: "—" };

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}
function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export function AttendanceClockTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const { data: employees = [] } = useEmployees();
  const stats = useMonthlyPunchStats(year, month);
  const { data: punches = [], isLoading } = useEmployeePunches(employeeId, year, month);
  const orphans = useOrphanPunches();

  const employeeOptions = useMemo(
    () => (employees ?? []).map((e: any) => ({ value: e.id, label: `${e.full_name}${e.employee_code ? ` (${e.employee_code})` : ""}` })),
    [employees],
  );

  const lastPunchAgoMin = stats.data?.lastAt
    ? Math.round((Date.now() - new Date(stats.data.lastAt).getTime()) / 60000)
    : null;

  return (
    <div className="space-y-6" dir="rtl">
      <AttendanceFlowIndicator />
      <ReclassifyButton />

      {/* Health widget */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={<Clock4 className="w-4 h-4" />} label="פעימות החודש" value={stats.data?.total ?? 0} />
        <StatCard icon={<Clock4 className="w-4 h-4" />} label="ממתינות לאישור" value={stats.data?.pending ?? 0} />
        <StatCard icon={<Check className="w-4 h-4" />} label="אושרו" value={stats.data?.approved ?? 0} />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="פאנץ' אחרון"
          value={
            lastPunchAgoMin == null
              ? "אין נתונים"
              : lastPunchAgoMin < 60
                ? `לפני ${lastPunchAgoMin} דק'`
                : `לפני ${Math.round(lastPunchAgoMin / 60)} שעות`
          }
          warn={lastPunchAgoMin != null && lastPunchAgoMin > 60}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">בחירת עובד וחודש</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">עובד</label>
              <SearchableSelect
                options={employeeOptions}
                value={employeeId ?? ""}
                onChange={(v) => setEmployeeId(v || null)}
                placeholder="בחר/י עובד…"


              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">חודש</label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">שנה</label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orphan punches */}
      {orphans.data && orphans.data.length > 0 && (
        <OrphansPanel punches={orphans.data} employees={employees} />
      )}

      {/* Employee monthly */}
      {employeeId ? (
        <EmployeeMonthlyTable punches={punches} loading={isLoading} />
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            בחר/י עובד כדי לראות את הפאנצ'ים החודשיים שלו.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">{icon}{label}</div>
        <div className={`text-xl font-semibold ${warn ? "text-destructive" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function OrphansPanel({ punches, employees }: { punches: AttendancePunch[]; employees: any[] }) {
  const assign = useAssignPunchEmployee();
  const update = useUpdatePunchStatus();
  const { toast } = useToast();
  const opts = useMemo(
    () => employees.map((e: any) => ({ value: e.id, label: `${e.full_name}${e.employee_code ? ` (${e.employee_code})` : ""}` })),
    [employees],
  );

  return (
    <Card className="border-yellow-500/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-600" />
          פעימות לא משויכות ({punches.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-right p-2">תאריך/שעה</th>
                <th className="text-right p-2">קוד עובד מהשעון</th>
                <th className="text-right p-2">כיוון</th>
                <th className="text-right p-2">שיוך לעובד</th>
                <th className="text-right p-2">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {punches.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2 whitespace-nowrap">{formatDate(p.punch_at)} {formatTime(p.punch_at)}</td>
                  <td className="p-2 font-mono">{p.employee_code_raw}</td>
                  <td className="p-2">{DIR_LABEL[p.direction]}</td>
                  <td className="p-2 min-w-[220px]">
                    <SearchableSelect
                      options={opts}
                      value=""
                      onChange={async (v) => {
                        if (!v) return;
                        try {
                          const res: any = await assign.mutateAsync({ punchId: p.id, employeeId: v });
                          const count = res?.count ?? 1;
                          toast({
                            title: count > 1 ? `שויכו ${count} פעימות` : "הפעימה שויכה",
                            description: count > 1 && res?.code
                              ? `כל הפעימות עם קוד ${res.code} שויכו אוטומטית, והקוד נשמר על העובד להמשך.`
                              : undefined,
                          });
                        } catch (e: any) {
                          toast({ title: "שגיאה", description: e.message, variant: "destructive" });
                        }
                      }}
                      placeholder="בחר/י עובד…"
                    />
                  </td>
                  <td className="p-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/40 hover:bg-destructive hover:text-destructive-foreground"
                      disabled={update.isPending}
                      onClick={async () => {
                        try {
                          await update.mutateAsync({ ids: [p.id], status: "rejected" });
                          toast({ title: "הפעימה נדחתה", description: "הוסרה מרשימת הפעימות הלא משויכות." });
                        } catch (e: any) {
                          toast({ title: "שגיאה בדחייה", description: e?.message ?? String(e), variant: "destructive" });
                        }
                      }}
                    >
                      <X className="w-4 h-4 ml-1" /> דחה
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function EmployeeMonthlyTable({ punches, loading }: { punches: AttendancePunch[]; loading: boolean }) {
  const update = useUpdatePunchStatus();
  const updatePunch = useUpdatePunch();
  const { toast } = useToast();

  const byDay = useMemo(() => {
    const map = new Map<string, AttendancePunch[]>();
    for (const p of punches) {
      const k = dayKey(p.punch_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [punches]);

  const totalHours = useMemo(() => {
    let total = 0;
    for (const [, day] of byDay) {
      const ins = day.filter(p => p.direction === "in").map(p => new Date(p.punch_at).getTime());
      const outs = day.filter(p => p.direction === "out").map(p => new Date(p.punch_at).getTime());
      if (ins.length && outs.length) {
        total += (Math.max(...outs) - Math.min(...ins)) / 3600000;
      }
    }
    return total;
  }, [byDay]);

  if (loading) return <Card><CardContent className="py-8 text-center text-muted-foreground">טוען…</CardContent></Card>;

  if (byDay.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          אין פעימות לעובד זה בחודש הנבחר.
        </CardContent>
      </Card>
    );
  }

  const pendingIds = punches.filter(p => p.status === "pending").map(p => p.id);

  const bulkApprove = async () => {
    if (pendingIds.length === 0) return;
    if (!confirm(`לאשר ${pendingIds.length} פעימות?`)) return;
    await update.mutateAsync({ ids: pendingIds, status: "approved" });
    toast({ title: "הפעימות אושרו" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>פעימות חודשיות — {byDay.length} ימים, {totalHours.toFixed(1)} שעות</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={bulkApprove} disabled={pendingIds.length === 0}>
              <Check className="w-4 h-4" /> אשר את כל הממתינות ({pendingIds.length})
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-right p-2">תאריך</th>
                <th className="text-right p-2">פעימות</th>
                <th className="text-right p-2">כניסה</th>
                <th className="text-right p-2">יציאה</th>
                <th className="text-right p-2">סה"כ</th>
                <th className="text-right p-2">סטטוס</th>
                <th className="text-right p-2">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map(([day, items]) => {
                const ins = items.filter(p => p.direction === "in");
                const outs = items.filter(p => p.direction === "out");
                const firstIn = ins[0]?.punch_at;
                const lastOut = outs[outs.length - 1]?.punch_at;
                const hours = firstIn && lastOut
                  ? ((new Date(lastOut).getTime() - new Date(firstIn).getTime()) / 3600000).toFixed(1)
                  : "—";
                const dayStatus = items.every(p => p.status === "approved") ? "approved"
                  : items.some(p => p.status === "rejected") ? "rejected"
                  : "pending";
                const dayIds = items.map(p => p.id);
                const pendingDayIds = items.filter(p => p.status === "pending").map(p => p.id);

                return (
                  <tr key={day} className="border-t align-top">
                    <td className="p-2 whitespace-nowrap">{new Date(day).toLocaleDateString("he-IL", { weekday: "short", day: "2-digit", month: "2-digit" })}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {items.map(p => (
                          <PunchChip key={p.id} punch={p} />
                        ))}
                      </div>
                    </td>
                    <td className="p-2 whitespace-nowrap">{firstIn ? formatTime(firstIn) : "—"}</td>
                    <td className="p-2 whitespace-nowrap">{lastOut ? formatTime(lastOut) : "—"}</td>
                    <td className="p-2">{hours}</td>
                    <td className="p-2"><Badge variant={STATUS_VARIANT[dayStatus]}>{STATUS_LABEL[dayStatus]}</Badge></td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" disabled={pendingDayIds.length === 0}
                          onClick={async () => {
                            if (!confirm(`לאשר ${pendingDayIds.length} פעימות ביום זה?`)) return;
                            await update.mutateAsync({ ids: pendingDayIds, status: "approved" });
                          }}>
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost"
                          onClick={async () => {
                            if (!confirm("לדחות את כל הפעימות ביום זה?")) return;
                            await update.mutateAsync({ ids: dayIds, status: "rejected" });
                          }}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function PunchChip({ punch }: { punch: AttendancePunch }) {
  const updatePunch = useUpdatePunch();
  const cycleDir = () => {
    const next = punch.direction === "in" ? "out" : punch.direction === "out" ? "unknown" : "in";
    updatePunch.mutate({ id: punch.id, patch: { direction: next } });
  };
  const color = punch.direction === "in" ? "bg-green-500/15 text-green-700 dark:text-green-300"
              : punch.direction === "out" ? "bg-red-500/15 text-red-700 dark:text-red-300"
              : "bg-muted text-muted-foreground";
  return (
    <button
      type="button"
      onClick={cycleDir}
      title="לחץ להחלפת כיוון"
      className={`px-2 py-0.5 rounded text-xs font-mono ${color}`}
    >
      {formatTime(punch.punch_at)} {DIR_LABEL[punch.direction]}
    </button>
  );
}

function ReclassifyButton() {
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const run = async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("classify_existing_punches" as any, { _company_id: activeCompanyId });
      if (error) throw error;
      toast({ title: "סיווג מחדש הושלם", description: `עודכנו ${data ?? 0} פעימות` });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex justify-end">
      <Button size="sm" variant="outline" onClick={run} disabled={loading}>
        {loading ? "מסווג..." : "סווג מחדש כניסות/יציאות"}
      </Button>
    </div>
  );
}

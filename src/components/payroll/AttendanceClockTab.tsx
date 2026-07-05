import { useMemo, useState } from "react";
import { useEmployees } from "@/hooks/useData";
import {
  useEmployeePunches,
  useOrphanPunches,
  useMonthlyPunchStats,
  useUpdatePunchStatus,
  useAssignPunchEmployee,
  useUpdatePunch,
  useAdminEditPunchTime,
  type AttendancePunch,
} from "@/hooks/useAttendancePunches";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Clock4, AlertTriangle, UserPlus2, ArrowRight, ArrowLeft, Pencil, HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { AttendanceFlowIndicator } from "./AttendanceFlowIndicator";
import { AttendanceGapsReport } from "./AttendanceGapsReport";
import { AttendanceSettingsSection } from "./AttendanceSettingsSection";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";

const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard icon={<Clock4 className="w-4 h-4" />} label="פעימות החודש" value={stats.data?.total ?? 0} />
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

      <AttendanceGapsReport />
      <AttendanceSettingsSection />
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          פעימות חודשיות — {byDay.length} ימים, {totalHours.toFixed(1)} שעות
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
                <th className="text-right p-2">מצב</th>
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
                const missing = !firstIn || !lastOut;

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
                    <td className="p-2">
                      {missing ? (
                        <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300 bg-amber-500/10">
                          חסרה החתמה
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
  const adminEdit = useAdminEditPunchTime();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [timeVal, setTimeVal] = useState("");
  const [dirVal, setDirVal] = useState<AttendancePunch["direction"]>(punch.direction);
  const [saving, setSaving] = useState(false);

  const originalTime = new Date(punch.punch_at).toTimeString().slice(0, 5);

  const openPopover = () => {
    setTimeVal(originalTime);
    setDirVal(punch.direction);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const timeChanged = timeVal && timeVal !== originalTime;
      const dirChanged = dirVal !== punch.direction;
      if (timeChanged) {
        const d = new Date(punch.punch_at);
        const [h, m] = timeVal.split(":").map(Number);
        d.setHours(h, m, 0, 0);
        await adminEdit.mutateAsync({ id: punch.id, newPunchAt: d.toISOString() });
      }
      if (dirChanged) {
        await updatePunch.mutateAsync({ id: punch.id, patch: { direction: dirVal } });
      }
      if (timeChanged || dirChanged) toast({ title: "הפעימה עודכנה" });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const color = punch.direction === "in"
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25"
    : punch.direction === "out"
    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25"
    : "bg-muted text-muted-foreground hover:bg-muted/80";
  const DirIcon = punch.direction === "in" ? ArrowRight : punch.direction === "out" ? ArrowLeft : HelpCircle;
  const wasEdited = !!(punch as any).edited_at;

  return (
    <Popover open={open} onOpenChange={(o) => (o ? openPopover() : setOpen(false))}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`px-2 py-0.5 rounded text-xs font-mono inline-flex items-center gap-1 transition-colors ${color}`}
          title="לחץ לעריכה"
        >
          <DirIcon className="w-3 h-3" aria-hidden="true" />
          <span>{formatTime(punch.punch_at)}</span>
          {wasEdited && <Pencil className="w-2.5 h-2.5 opacity-60" aria-label="נערך ידנית" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start" dir="rtl">
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">שעה</label>
            <Input
              type="time"
              value={timeVal}
              onChange={(e) => setTimeVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              autoFocus
              className="h-9"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1.5">כיוון</label>
            <div className="grid grid-cols-3 gap-1">
              {([
                { v: "in" as const, label: "כניסה", Icon: ArrowRight, active: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40" },
                { v: "out" as const, label: "יציאה", Icon: ArrowLeft, active: "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40" },
                { v: "unknown" as const, label: "לא ידוע", Icon: HelpCircle, active: "bg-muted-foreground/20 text-foreground border-muted-foreground/40" },
              ] as const).map(({ v, label, Icon, active }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDirVal(v)}
                  className={`h-8 rounded-md border text-[11px] font-medium inline-flex items-center justify-center gap-1 transition-colors ${
                    dirVal === v ? active : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              <X className="w-3.5 h-3.5 ml-1" /> ביטול
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              <Check className="w-3.5 h-3.5 ml-1" /> {saving ? "שומר..." : "שמירה"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
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

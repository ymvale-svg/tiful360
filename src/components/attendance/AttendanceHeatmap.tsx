// Attendance calendar adapted from "Heat Calendar" (starc007, beui.dev) on 21st.dev: one square per
// day, weeks as columns, a single-hue scale for hours present, plus a separate tint for approved leave.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildAttendanceWeeks, summarize, type HeatCell } from "@/lib/attendanceHeat";
import { cn } from "@/lib/utils";

const WEEKS = 16;
const DAY_NAMES = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const LEVEL = ["bg-muted", "bg-primary/25", "bg-primary/45", "bg-primary/70", "bg-primary"];

function cellClass(c: HeatCell) {
  if (c.kind === "future") return "bg-transparent";
  if (c.kind === "leave") return "bg-warning/60";
  return LEVEL[c.level];
}

function cellTitle(c: HeatCell) {
  const date = new Date(`${c.date}T12:00:00`).toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "numeric" });
  if (c.kind === "leave") return `${date}: היעדרות מאושרת`;
  if (c.kind === "worked") return c.punches > 1 ? `${date}: ${c.hours.toFixed(1)} שעות` : `${date}: החתמה אחת`;
  if (c.kind === "future") return "";
  return `${date}: אין החתמות`;
}

export function AttendanceHeatmap({ employeeId, leaves }: {
  employeeId: string;
  leaves?: readonly { start_date: string; end_date: string | null; status: string }[];
}) {
  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() - (WEEKS - 1) * 7);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const { data: punches, error, isLoading } = useQuery({
    queryKey: ["attendance_punches", "heat", employeeId, since],
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("attendance_punches")
        .select("punch_at")
        .eq("employee_id", employeeId)
        .neq("status", "rejected")
        .gte("punch_at", since)
        .order("punch_at");
      if (e) throw e;
      return (data ?? []).map((p) => p.punch_at);
    },
  });

  const weeks = useMemo(() => buildAttendanceWeeks(punches ?? [], leaves ?? [], WEEKS), [punches, leaves]);
  const stats = useMemo(() => summarize(weeks), [weeks]);

  // Without access to punches (RLS) there is nothing honest to draw.
  if (error) return null;

  const months = weeks.map((w, i) => {
    const m = w[0].date.slice(5, 7);
    return i === 0 || weeks[i - 1][0].date.slice(5, 7) !== m
      ? new Date(`${w[0].date}T12:00:00`).toLocaleDateString("he-IL", { month: "short" })
      : "";
  });

  return (
    <div className="mt-3 rounded-lg border border-border/60 p-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium">
        <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
        נוכחות ב-16 השבועות האחרונים
      </p>
      {isLoading ? (
        <div className="h-[118px] animate-pulse rounded-md bg-muted motion-reduce:animate-none" role="status" aria-label="טוען נוכחות" />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {stats.workedDays} ימי נוכחות
            {stats.avgHours > 0 && ` · ממוצע ${stats.avgHours.toFixed(1)} שעות ביום`}
            {stats.leaveDays > 0 && ` · ${stats.leaveDays} ימי היעדרות מאושרת`}
          </p>
          <div className="overflow-x-auto pb-1" aria-hidden="true">
            <div className="inline-flex gap-1">
              <div className="flex flex-col gap-1 pt-4 text-[10px] leading-3 text-muted-foreground">
                {DAY_NAMES.map((d, i) => <span key={d} className={cn("h-3", i % 2 && "invisible")}>{d}</span>)}
              </div>
              {weeks.map((w, i) => (
                <div key={w[0].date} className="flex flex-col gap-1">
                  <span className="h-3 whitespace-nowrap text-[10px] leading-3 text-muted-foreground">{months[i]}</span>
                  {w.map((c) => (
                    <span key={c.date} title={cellTitle(c)} className={cn("h-3 w-3 rounded-[3px]", cellClass(c), c.kind === "future" && "border border-dashed border-border/50")} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground" aria-hidden="true">
            <span className="flex items-center gap-1">פחות {LEVEL.map((l) => <span key={l} className={cn("h-2.5 w-2.5 rounded-[2px]", l)} />)} יותר שעות</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[2px] bg-warning/60" />היעדרות מאושרת</span>
          </div>
        </>
      )}
    </div>
  );
}

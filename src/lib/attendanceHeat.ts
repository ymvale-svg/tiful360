export type HeatKind = "none" | "worked" | "leave" | "future";

export interface HeatCell {
  date: string; // YYYY-MM-DD, local
  kind: HeatKind;
  /** Hours between the first and last punch of the day; 0 for a single punch. */
  hours: number;
  punches: number;
  /** 0–4: colour step for worked days. */
  level: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function heatLevel(hours: number, punches: number): number {
  if (punches === 0) return 0;
  if (hours < 4) return 1;
  if (hours < 8) return 2;
  if (hours < 10) return 3;
  return 4;
}

/**
 * Weeks (Sunday first) ending with the current week, each a column of seven days, with the punches
 * of each day reduced to hours present, and approved leave marked.
 */
export function buildAttendanceWeeks(
  punchTimes: readonly string[],
  leaves: readonly { start_date: string; end_date: string | null; status: string }[],
  weeks: number,
  today = new Date(),
): HeatCell[][] {
  const byDay = new Map<string, number[]>();
  for (const t of punchTimes) {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) continue;
    const key = localDay(d);
    const list = byDay.get(key) ?? [];
    list.push(d.getTime());
    byDay.set(key, list);
  }
  const onLeave = (key: string) =>
    leaves.some((l) => l.status === "approved" && l.start_date <= key && (l.end_date ?? l.start_date) >= key);

  const todayKey = localDay(today);
  const firstSunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - (weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate() + w * 7 + d);
      const key = localDay(date);
      const times = byDay.get(key) ?? [];
      const hours = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 3_600_000 : 0;
      const kind: HeatKind = key > todayKey ? "future" : times.length ? "worked" : onLeave(key) ? "leave" : "none";
      return { date: key, kind, hours, punches: times.length, level: kind === "worked" ? heatLevel(hours, times.length) : 0 };
    }),
  );
}

export function summarize(weeks: readonly HeatCell[][]) {
  const cells = weeks.flat();
  const worked = cells.filter((c) => c.kind === "worked");
  const withHours = worked.filter((c) => c.punches > 1);
  return {
    workedDays: worked.length,
    leaveDays: cells.filter((c) => c.kind === "leave").length,
    avgHours: withHours.length ? withHours.reduce((s, c) => s + c.hours, 0) / withHours.length : 0,
  };
}

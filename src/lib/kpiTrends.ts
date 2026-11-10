/**
 * Rebuilds a daily series for a count we only know today, from when each row started and stopped
 * counting. Rows counted now and added after a day are removed for that day; rows not counted now
 * that stopped after that day (and had already started) are added back.
 */
export interface TrendRow {
  /** When the row started counting (created, start date). */
  from: Date | null;
  /** When it stopped counting (resolved, end date); null if it hasn't. */
  until: Date | null;
  /** Whether it is part of today's count. */
  countedNow: boolean;
}

export function rebuildSeries(current: number, rows: readonly TrendRow[], ends: readonly Date[]): number[] {
  return ends.map((end, i) => {
    if (i === ends.length - 1) return current;
    let value = current;
    for (const r of rows) {
      const startedBy = !r.from || r.from <= end;
      if (r.countedNow && !startedBy) value -= 1;
      else if (!r.countedNow && startedBy && r.until && r.until > end) value += 1;
    }
    return Math.max(0, value);
  });
}

/** End of each of the last `days` local days, today last (ending now). */
export function dayEnds(days: number, now = new Date()): Date[] {
  return Array.from({ length: days }, (_, i) => {
    const back = days - 1 - i;
    if (back === 0) return now;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, 23, 59, 59, 999);
  });
}

/** Change from the first point to the last, in percent; undefined when it can't be expressed. */
export function percentChange(series: readonly number[]): number | undefined {
  if (series.length < 2) return undefined;
  const first = series[0];
  const last = series[series.length - 1];
  if (first === 0) return undefined;
  return ((last - first) / first) * 100;
}

/** A date-only value ("2026-10-01") as the end of that local day, so it counts from that day on. */
export function dateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (value.length > 10) return new Date(value);
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

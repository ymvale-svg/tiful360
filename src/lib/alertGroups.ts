export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertLike {
  id: string;
  severity: AlertSeverity | string;
  target_date: string | null;
}

export type AlertGroupKey = "overdue" | "week" | "later" | "undated";

export const ALERT_GROUP_LABEL: Record<AlertGroupKey, string> = {
  overdue: "עבר המועד",
  week: "בשבוע הקרוב",
  later: "בהמשך",
  undated: "ללא תאריך יעד",
};

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Whole days from today to the alert's target date (negative = past due). */
export function daysUntil(target: string, now = new Date()): number {
  const [y, m, d] = target.slice(0, 10).split("-").map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - startOfDay(now)) / DAY);
}

/** "היום", "מחר", "בעוד 9 ימים", "לפני 3 ימים". */
export function relativeDay(days: number): string {
  if (days === 0) return "היום";
  if (days === 1) return "מחר";
  if (days === -1) return "אתמול";
  return days > 0 ? `בעוד ${days} ימים` : `לפני ${-days} ימים`;
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Groups alerts by how soon they need attention, in a fixed order, each group sorted by
 * severity and then by date. Empty groups are dropped.
 */
export function groupAlerts<T extends AlertLike>(alerts: readonly T[], now = new Date()) {
  const groups: Record<AlertGroupKey, T[]> = { overdue: [], week: [], later: [], undated: [] };
  for (const a of alerts) {
    if (!a.target_date) { groups.undated.push(a); continue; }
    const d = daysUntil(a.target_date, now);
    groups[d < 0 ? "overdue" : d <= 7 ? "week" : "later"].push(a);
  }
  const order: AlertGroupKey[] = ["overdue", "week", "later", "undated"];
  return order
    .map((key) => ({
      key,
      label: ALERT_GROUP_LABEL[key],
      items: groups[key].sort((x, y) =>
        (SEVERITY_RANK[x.severity] ?? 3) - (SEVERITY_RANK[y.severity] ?? 3)
        || (x.target_date ?? "").localeCompare(y.target_date ?? "")),
    }))
    .filter((g) => g.items.length > 0);
}

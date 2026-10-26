export interface ApprovedLeave {
  start_date: string;
  end_date: string | null;
  request_type: string;
}

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  vacation: "חופשה",
  sick: "מחלה",
  reserve: "מילואים",
  personal: "יום אישי",
  other: "היעדרות",
};

// ימי עבודה בישראל: ראשון–חמישי (0 = ראשון)
const DEFAULT_WORK_DAYS = [0, 1, 2, 3, 4];

export function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * כל ימי העבודה בחודש (א׳–ה׳, בלי חגי חברה), עד היום כולל.
 * סופי שבוע וחגים אינם מוצגים כלל; ימים עתידיים בחודש הנוכחי אינם מוצגים.
 */
export function monthWorkingDays(
  year: number,
  month: number,
  holidayKeys: Set<string>,
  today: Date = new Date(),
): string[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayKey = toDayKey(today);
  const out: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const key = toDayKey(date);
    if (key > todayKey) break;
    if (!DEFAULT_WORK_DAYS.includes(date.getDay())) continue;
    if (holidayKeys.has(key)) continue;
    out.push(key);
  }
  return out;
}

/** תווית ההיעדרות המאושרת המכסה את היום הנתון, או null אם אין. */
export function leaveLabelForDay(leaves: ApprovedLeave[], dayKey: string): string | null {
  for (const l of leaves) {
    const start = String(l.start_date).slice(0, 10);
    const end = l.end_date ? String(l.end_date).slice(0, 10) : "9999-12-31";
    if (dayKey >= start && dayKey <= end) return LEAVE_TYPE_LABEL[l.request_type] ?? "היעדרות";
  }
  return null;
}

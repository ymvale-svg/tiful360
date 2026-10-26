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
  training: "השתלמות",
  unpaid: "חל\"ת",
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

export interface MonthPunch {
  id: string;
  employee_id: string | null;
  punch_at: string;
  direction: string;
}

export type DayStatus = "ok" | "missing" | "partial" | "leave";

export interface ReviewDay {
  day: string;
  inPunch: MonthPunch | null;
  outPunch: MonthPunch | null;
  leave: string | null;
  status: DayStatus;
}

/**
 * שורת יום לכל יום עבודה: היעדרות מאושרת → "leave"; כניסה+יציאה → "ok";
 * החתמה אחת בלבד → "partial"; בלי החתמה → "missing".
 */
export function buildReviewDays(
  workingDays: string[],
  punches: MonthPunch[],
  leaves: ApprovedLeave[],
): ReviewDay[] {
  const byDay = new Map<string, MonthPunch[]>();
  for (const p of punches) {
    const k = toDayKey(new Date(p.punch_at));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(p);
  }
  return workingDays.map((day) => {
    const list = (byDay.get(day) ?? []).slice().sort((a, b) => a.punch_at.localeCompare(b.punch_at));
    const inPunch = list.find((p) => p.direction === "in") ?? (list.length ? list[0] : null);
    const outCand = [...list].reverse().find((p) => p.direction === "out") ?? (list.length > 1 ? list[list.length - 1] : null);
    const outPunch = outCand && outCand.id !== inPunch?.id ? outCand : null;
    const leave = leaveLabelForDay(leaves, day);
    let status: DayStatus;
    if (inPunch && outPunch) status = "ok";
    else if (leave) status = "leave";
    else if (inPunch || outPunch) status = "partial";
    else status = "missing";
    return { day, inPunch, outPunch, leave, status };
  });
}

export const isGapDay = (d: ReviewDay) => d.status === "missing" || d.status === "partial";

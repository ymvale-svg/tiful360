// Shared definitions for employee service tickets (קריאות שירות)

export const TICKET_SUBJECTS = [
  { value: "computing", label: "מיחשוב", ticketType: "hardware" },
  { value: "peripherals", label: "ציוד היקפי", ticketType: "hardware" },
  { value: "furniture", label: "ריהוט משרדי", ticketType: "hardware" },
  { value: "software", label: "תוכנות", ticketType: "software" },
  { value: "other", label: "אחר", ticketType: "access" },
] as const;

export type TicketSubject = (typeof TICKET_SUBJECTS)[number]["value"];

export const OFFBOARDING_SUBJECT = "offboarding";
export const ONBOARDING_SUBJECT = "onboarding";

export function subjectLabel(value: string | null | undefined) {
  if (value === OFFBOARDING_SUBJECT) return "ניתוקים / סיום העסקה";
  if (value === ONBOARDING_SUBJECT) return "קליטת עובד";
  return TICKET_SUBJECTS.find((s) => s.value === value)?.label ?? "אחר";
}

export function subjectTicketType(value: string) {
  return TICKET_SUBJECTS.find((s) => s.value === value)?.ticketType ?? "access";
}

export const TICKET_PRIORITIES = [
  { value: "medium", label: "רגיל" },
  { value: "critical", label: "דחוף" },
] as const;

export const PRIORITY_LABELS: Record<string, string> = {
  critical: "דחוף",
  high: "גבוה",
  medium: "רגיל",
  low: "נמוך",
};

export const STATUS_LABELS: Record<string, string> = {
  open: "נפתחה",
  in_progress: "בטיפול",
  done: "טופלה",
};

export const STATUS_CLASSES: Record<string, string> = {
  open: "bg-warning/15 text-warning-foreground border-warning/40",
  in_progress: "bg-info/15 text-info border-info/40",
  done: "bg-success/15 text-success border-success/40",
};

/** Default SLA target hours per subject + priority */
export const DEFAULT_SLA_HOURS: Record<string, { medium: number; critical: number }> = {
  computing: { medium: 24, critical: 4 },
  peripherals: { medium: 48, critical: 8 },
  furniture: { medium: 72, critical: 24 },
  software: { medium: 24, critical: 4 },
  other: { medium: 48, critical: 8 },
  [OFFBOARDING_SUBJECT]: { medium: 24, critical: 4 },
  [ONBOARDING_SUBJECT]: { medium: 48, critical: 8 },
};

export function defaultSlaHours(subject: string, priority: string) {
  const row = DEFAULT_SLA_HOURS[subject] ?? DEFAULT_SLA_HOURS.other;
  return priority === "critical" ? row.critical : row.medium;
}

export interface SlaSettingRow {
  id?: string;
  subject_category: string;
  priority: string;
  target_hours: number;
  notify_on_breach: boolean;
}

export function resolveSlaHours(
  settings: SlaSettingRow[] | undefined,
  subject: string,
  priority: string,
) {
  const match = settings?.find(
    (s) => s.subject_category === subject && s.priority === priority,
  );
  return match?.target_hours ?? defaultSlaHours(subject, priority);
}

/** Business hours: Sun–Thu 08:00–17:00 local time, excluding company holidays. */
export const BUSINESS_START_HOUR = 8;
export const BUSINESS_END_HOUR = 17;
const BUSINESS_DAY_MS = (BUSINESS_END_HOUR - BUSINESS_START_HOUR) * 3600_000;

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function isBusinessDay(d: Date, holidays?: Set<string>) {
  const dow = d.getDay();
  if (dow === 5 || dow === 6) return false;
  return !holidays?.has(ymd(d));
}

/** Business milliseconds between two dates (always >= 0, order-independent). */
export function businessMsBetween(a: Date, b: Date, holidays?: Set<string>) {
  let from = a, to = b;
  if (from > to) [from, to] = [to, from];
  let total = 0;
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let guard = 0;
  while (day <= to && guard++ < 3660) {
    if (isBusinessDay(day, holidays)) {
      const s = new Date(day); s.setHours(BUSINESS_START_HOUR, 0, 0, 0);
      const e = new Date(day); e.setHours(BUSINESS_END_HOUR, 0, 0, 0);
      const start = Math.max(s.getTime(), from.getTime());
      const end = Math.min(e.getTime(), to.getTime());
      if (end > start) total += end - start;
    }
    day.setDate(day.getDate() + 1);
  }
  return total;
}

/** Add business hours to a start date. */
export function addBusinessHours(from: Date, hours: number, holidays?: Set<string>) {
  let remaining = hours * 3600_000;
  const cur = new Date(from);
  let guard = 0;
  while (remaining > 0 && guard++ < 3660) {
    if (isBusinessDay(cur, holidays)) {
      const s = new Date(cur); s.setHours(BUSINESS_START_HOUR, 0, 0, 0);
      const e = new Date(cur); e.setHours(BUSINESS_END_HOUR, 0, 0, 0);
      const start = Math.max(s.getTime(), cur.getTime());
      if (start < e.getTime()) {
        const avail = e.getTime() - start;
        if (remaining <= avail) return new Date(start + remaining);
        remaining -= avail;
      }
    }
    cur.setDate(cur.getDate() + 1);
    cur.setHours(0, 0, 0, 0);
  }
  return cur;
}

export function slaDeadlineFrom(hours: number, from = new Date(), holidays?: Set<string>) {
  return addBusinessHours(from, hours, holidays).toISOString();
}

/** Human-readable business-time duration, e.g. "2 ימי עבודה 3 ש׳" or "5 ש׳ 20 ד׳". */
export function formatBusinessDuration(ms: number) {
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor((totalMin * 60000) / BUSINESS_DAY_MS);
  const restMin = totalMin - Math.floor((days * BUSINESS_DAY_MS) / 60000);
  const h = Math.floor(restMin / 60);
  const m = restMin % 60;
  if (days > 0) {
    const d = days === 1 ? "יום עבודה" : `${days} ימי עבודה`;
    return h > 0 ? `${d} ${h} ש׳` : d;
  }
  if (h > 0) return m > 0 ? `${h} ש׳ ${m} ד׳` : `${h} ש׳`;
  return `${m} ד׳`;
}

/** Remaining business time until deadline. */
export function slaRemaining(deadline: string | null | undefined, holidays?: Set<string>) {
  if (!deadline) return null;
  const now = new Date();
  const dl = new Date(deadline);
  const breached = dl.getTime() <= now.getTime();
  const ms = businessMsBetween(now, dl, holidays);
  return { breached, label: formatBusinessDuration(ms) };
}

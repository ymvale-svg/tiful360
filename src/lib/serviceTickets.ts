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

export function subjectLabel(value: string | null | undefined) {
  if (value === OFFBOARDING_SUBJECT) return "ניתוקים / סיום העסקה";
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

export function slaDeadlineFrom(hours: number, from = new Date()) {
  return new Date(from.getTime() + hours * 3600_000).toISOString();
}

export function generateTicketCode() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `IT-${ts}-${rand}`;
}

/** Remaining time until deadline; negative values mean the SLA was breached. */
export function slaRemaining(deadline: string | null | undefined) {
  if (!deadline) return null;
  const diff = new Date(deadline).getTime() - Date.now();
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  return {
    breached: diff <= 0,
    label: `${h}:${String(m).padStart(2, "0")}`,
  };
}

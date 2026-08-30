// ייצוא נתוני נוכחות לקליטה במיכפל.
// מבנה CSV לפי מסמך "הגדרת מבנה קובץ נתוני נוכחות" של מיכפל:
// תאריך dd/mm/yyyy, שעה hh:mm:ss, קוד פעולה (0 כניסה / 1 יציאה / A יום היעדרות / H שעות היעדרות),
// זיהוי כרטיס (קוד עובד), אירוע (סוג היעדרות), אירוע חלקי (שעת סיום היעדרות).
// הקובץ ממוין לפי זיהוי כרטיס, תאריך, שעה, קוד פעולה, בקידוד Windows-1255 עם סיומי שורה CRLF.

export const MICHPAL_HEADER = "תאריך,שעה,קוד פעולה,זיהוי כרטיס,אירוע ,אירוע חלקי";

export type MichpalActionCode = "0" | "1" | "A" | "H";

export interface MichpalRow {
  /** yyyy-mm-dd (שעון ישראל) */
  date: string;
  /** hh:mm:ss */
  time: string;
  action: MichpalActionCode;
  cardId: string;
  absenceCode?: string;
  /** hh:mm:ss — רק בשורות H */
  absenceEnd?: string;
}

const IL_TZ = "Asia/Jerusalem";

/** yyyy-mm-dd בשעון ישראל */
export function ilDate(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleDateString("en-CA", { timeZone: IL_TZ });
}

/** hh:mm:ss בשעון ישראל */
export function ilTime(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleTimeString("en-GB", {
    timeZone: IL_TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** yyyy-mm-dd -> dd/mm/yyyy */
export function toMichpalDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

const ACTION_ORDER: Record<MichpalActionCode, number> = { "0": 0, "1": 1, A: 2, H: 3 };

export function sortMichpalRows(rows: MichpalRow[]): MichpalRow[] {
  return [...rows].sort(
    (a, b) =>
      a.cardId.localeCompare(b.cardId, "en", { numeric: true }) ||
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      ACTION_ORDER[a.action] - ACTION_ORDER[b.action],
  );
}

export function buildMichpalCsv(rows: MichpalRow[], includeHeader = true): string {
  const lines = sortMichpalRows(rows).map((r) =>
    [
      toMichpalDate(r.date),
      r.time,
      r.action,
      r.cardId,
      r.absenceCode ?? "",
      r.absenceEnd ?? "",
    ].join(","),
  );
  const all = includeHeader ? [MICHPAL_HEADER, ...lines] : lines;
  return all.join("\r\n") + "\r\n";
}

// ---- Windows-1255 encoding ----
// עברית ב-CP1255 ממופה מ-U+05D0..U+05EA אל 0xE0..0xFA (רציף).
export function encodeWindows1255(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)!;
    if (cp < 0x80) out[i] = cp;
    else if (cp >= 0x05d0 && cp <= 0x05ea) out[i] = cp - 0x05d0 + 0xe0; // אותיות עבריות
    else if (cp === 0x05be) out[i] = 0xbe; // מקף עברי
    else if (cp === 0x05f3) out[i] = 0xd7; // גרש
    else if (cp === 0x05f4) out[i] = 0xd8; // גרשיים
    else if (cp >= 0x0590 && cp <= 0x05c7) out[i] = 0xc0 + (cp - 0x0591); // ניקוד/טעמים (נדיר)
    else out[i] = 0x3f; // '?'
  }
  return out;
}

export function michpalCsvBlob(csv: string): Blob {
  const bytes = encodeWindows1255(csv);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "text/csv;charset=windows-1255" });
}

export function downloadMichpalCsv(csv: string, fileName: string) {
  const url = URL.createObjectURL(michpalCsvBlob(csv));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---- מיפוי נתוני המערכת לשורות מיכפל ----

export type MichpalSource = "clock" | "remote" | "combined";

/** מקורות ההחתמה הנחשבים "החתמה מרחוק" */
export const REMOTE_SOURCES = ["portal_remote", "manual_self", "manual", "portal"];

/**
 * נירמול קוד עובד ל"זיהוי כרטיס" במיכפל.
 * מסיר את הקידומת "EMP-" (למשל EMP-309 -> 309) ולוקח רק את המספר/הערך הפנימי.
 */
export function normalizeCardId(rawCode: string): string {
  let code = (rawCode ?? "").trim();
  if (code.toUpperCase().startsWith("EMP-")) code = code.slice(4).trim();
  return code;
}

export function matchesSource(source: string, filter: MichpalSource): boolean {
  if (filter === "combined") return true;
  const isRemote = REMOTE_SOURCES.includes(source);
  return filter === "remote" ? isRemote : !isRemote;
}

export interface PunchLike {
  employee_id: string | null;
  punch_at: string;
  direction: string;
  source: string;
  status: string;
}

export interface PunchMapResult {
  rows: MichpalRow[];
  skippedUnknownDirection: number;
  skippedNoCode: number;
  employeeIds: Set<string>;
}

export function punchesToMichpalRows(
  punches: PunchLike[],
  codeByEmployee: Map<string, string>,
  filter: MichpalSource,
): PunchMapResult {
  const rows: MichpalRow[] = [];
  let skippedUnknownDirection = 0;
  let skippedNoCode = 0;
  const employeeIds = new Set<string>();

  for (const p of punches) {
    if (p.status === "rejected") continue;
    if (!matchesSource(p.source, filter)) continue;
    if (!p.employee_id) { skippedNoCode++; continue; }
    const code = normalizeCardId(codeByEmployee.get(p.employee_id) ?? "");
    if (!code) { skippedNoCode++; continue; }
    if (p.direction !== "in" && p.direction !== "out") { skippedUnknownDirection++; continue; }
    rows.push({
      date: ilDate(p.punch_at),
      time: ilTime(p.punch_at),
      action: p.direction === "in" ? "0" : "1",
      cardId: code,
    });
    employeeIds.add(p.employee_id);
  }

  return { rows, skippedUnknownDirection, skippedNoCode, employeeIds };
}

export interface LeaveLike {
  employee_id: string;
  request_type: string;
  start_date: string;
  end_date: string | null;
}

// קודי אירוע כפי שמוגדרים במיכפל:
// חופשה = חפש, מחלה = 001, השתלמות = 002, חופשה ללא תשלום = חלת, מילואים = צבא
export const DEFAULT_ABSENCE_CODES: Record<string, string> = {
  vacation: "חפש",
  sick: "001",
  training: "002",
  unpaid: "חלת",
  reserve: "צבא",
  personal: "חפש",
  other: "חפש",
};

/** כל יום היעדרות מאושר בטווח -> שורת A בשעה 00:00:00 */
export function leavesToMichpalRows(
  leaves: LeaveLike[],
  codeByEmployee: Map<string, string>,
  absenceCodes: Record<string, string>,
  from: string,
  to: string,
): MichpalRow[] {
  const rows: MichpalRow[] = [];
  for (const l of leaves) {
    const code = normalizeCardId(codeByEmployee.get(l.employee_id) ?? "");
    if (!code) continue;
    const absence = absenceCodes[l.request_type] ?? absenceCodes.other ?? "9";
    const start = l.start_date < from ? from : l.start_date;
    const rawEnd = l.end_date ?? l.start_date;
    const end = rawEnd > to ? to : rawEnd;
    if (end < start) continue;
    for (let d = new Date(`${start}T00:00:00`); ilDate(d) <= end; d.setDate(d.getDate() + 1)) {
      rows.push({
        date: ilDate(d),
        time: "00:00:00",
        action: "A",
        cardId: code,
        absenceCode: absence,
      });
      if (rows.length > 20000) break;
    }
  }
  return rows;
}

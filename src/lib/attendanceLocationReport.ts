// דוח החתמות ומיקומים: לכל עובד ולכל יום — שעת כניסה ומיקומה, שעת יציאה ומיקומה.
// כל כניסה מחוברת ליציאה הבאה אחריה (גם אם היא ביום הבא — משמרת לילה נרשמת ביום
// הכניסה), כל עוד עברו עד MAX_SHIFT_HOURS שעות. ימים ושעות לפי שעון ישראל.
import { ilDate } from "@/lib/michpalExport";

const IL_TZ = "Asia/Jerusalem";

/** Above this gap a check-in and check-out are not treated as one shift. */
export const MAX_SHIFT_HOURS = 20;

/** One row of get_attendance_location_report. */
export interface ReportPunch {
  punch_id: string;
  employee_id: string;
  full_name: string;
  department: string | null;
  employee_code: string | null;
  punch_at: string;
  direction: string;
  source: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  geo_address: string | null;
}

export interface PunchPlace {
  punch_id: string;
  at: string;
  /** HH:MM, Israel time */
  time: string;
  /** Address, coordinates, or why there is no location. */
  place: string;
  lat: number | null;
  lng: number | null;
  /** Has a GPS point whose address wasn't resolved yet. */
  addressPending: boolean;
}

export interface ShiftRow {
  key: string;
  employee_id: string;
  full_name: string;
  department: string | null;
  employee_code: string | null;
  /** yyyy-mm-dd (Israel) of the check-in, or of the check-out when there is no check-in. */
  day: string;
  in: PunchPlace | null;
  out: PunchPlace | null;
  /** Minutes between check-in and check-out, when both exist. */
  minutes: number | null;
  note: string;
}

export const NOTE = {
  missingOut: "חסרה יציאה",
  missingIn: "חסרה כניסה",
  atWork: "בעבודה",
  unknownDirection: "החתמה ללא כיוון",
} as const;

export function hasGeo(p: Pick<ReportPunch, "lat" | "lng">): boolean {
  return typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** What to show as the punch location. */
export function placeLabel(p: ReportPunch): string {
  if (hasGeo(p)) {
    return p.geo_address ? p.geo_address : formatCoords(p.lat as number, p.lng as number);
  }
  if (p.source === "clock") return "שעון נוכחות";
  if (p.source === "correction" || p.source.startsWith("manual")) return "הוזן ידנית";
  return "ללא מיקום";
}

export function ilTimeHm(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-GB", { timeZone: IL_TZ, hour12: false, hour: "2-digit", minute: "2-digit" });
}

/** "יום ראשון" etc. for a yyyy-mm-dd day. */
export function hebrewWeekday(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("he-IL", { timeZone: "UTC", weekday: "long" });
}

/** dd/mm/yyyy */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

/** H:MM */
export function formatMinutes(min: number | null): string {
  if (min == null) return "";
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

function toPlace(p: ReportPunch): PunchPlace {
  return {
    punch_id: p.punch_id,
    at: p.punch_at,
    time: ilTimeHm(p.punch_at),
    place: placeLabel(p),
    lat: p.lat,
    lng: p.lng,
    addressPending: hasGeo(p) && p.geo_address == null,
  };
}

/**
 * Pairs punches into shift rows and keeps rows whose day is within [from, to].
 * `punches` may include the day after `to`, so a night shift on the last day finds its check-out.
 */
export function buildShiftRows(
  punches: readonly ReportPunch[],
  from: string,
  to: string,
  now: Date = new Date(),
): ShiftRow[] {
  const byEmp = new Map<string, ReportPunch[]>();
  for (const p of punches) {
    const list = byEmp.get(p.employee_id) ?? [];
    list.push(p);
    byEmp.set(p.employee_id, list);
  }

  const maxGapMs = MAX_SHIFT_HOURS * 3600_000;
  const rows: ShiftRow[] = [];

  for (const list of byEmp.values()) {
    list.sort((a, b) => a.punch_at.localeCompare(b.punch_at) || a.punch_id.localeCompare(b.punch_id));
    const emp = list[0];
    const base = {
      employee_id: emp.employee_id,
      full_name: emp.full_name,
      department: emp.department,
      employee_code: emp.employee_code,
    };
    const push = (inP: ReportPunch | null, outP: ReportPunch | null, note: string) => {
      const anchor = (inP ?? outP)!;
      const minutes = inP && outP
        ? Math.round((Date.parse(outP.punch_at) - Date.parse(inP.punch_at)) / 60000)
        : null;
      rows.push({
        ...base,
        key: `${anchor.punch_id}-${outP?.punch_id ?? ""}`,
        day: ilDate(anchor.punch_at),
        in: inP ? toPlace(inP) : null,
        out: outP ? toPlace(outP) : null,
        minutes,
        note,
      });
    };

    let open: ReportPunch | null = null;
    const closeOpen = () => {
      if (!open) return;
      const recent = now.getTime() - Date.parse(open.punch_at) < maxGapMs;
      push(open, null, recent ? NOTE.atWork : NOTE.missingOut);
      open = null;
    };

    for (const p of list) {
      if (p.direction === "in") {
        if (open) {
          push(open, null, NOTE.missingOut);
        }
        open = p;
      } else if (p.direction === "out") {
        if (open && Date.parse(p.punch_at) - Date.parse(open.punch_at) <= maxGapMs) {
          push(open, p, "");
          open = null;
        } else {
          if (open) {
            push(open, null, NOTE.missingOut);
            open = null;
          }
          push(null, p, NOTE.missingIn);
        }
      } else {
        // Direction unknown: shown on its own row, never guessed.
        push(p, null, NOTE.unknownDirection);
      }
    }
    closeOpen();
  }

  return rows
    .filter((r) => r.day >= from && r.day <= to)
    .sort((a, b) =>
      a.full_name.localeCompare(b.full_name, "he")
      || a.employee_id.localeCompare(b.employee_id)
      || (a.in?.at ?? a.out!.at).localeCompare(b.in?.at ?? b.out!.at),
    );
}

/** Punch ids with a GPS point and no resolved address. */
export function punchIdsMissingAddress(punches: readonly ReportPunch[]): string[] {
  return punches.filter((p) => hasGeo(p) && p.geo_address == null).map((p) => p.punch_id);
}

export const EXPORT_HEADERS: { key: string; label: string }[] = [
  { key: "full_name", label: "עובד" },
  { key: "employee_code", label: "מספר עובד" },
  { key: "department", label: "מחלקה" },
  { key: "date", label: "תאריך" },
  { key: "weekday", label: "יום" },
  { key: "in_time", label: "שעת כניסה" },
  { key: "in_place", label: "מיקום כניסה" },
  { key: "out_time", label: "שעת יציאה" },
  { key: "out_place", label: "מיקום יציאה" },
  { key: "duration", label: "משך" },
  { key: "note", label: "הערה" },
];

export function toExportRows(rows: readonly ShiftRow[]): Record<string, string>[] {
  return rows.map((r) => ({
    full_name: r.full_name,
    employee_code: r.employee_code ?? "",
    department: r.department ?? "",
    date: formatDay(r.day),
    weekday: hebrewWeekday(r.day),
    in_time: r.in?.time ?? "",
    in_place: r.in?.place ?? "",
    out_time: r.out?.time ?? "",
    out_place: r.out?.place ?? "",
    duration: formatMinutes(r.minutes),
    note: r.note,
  }));
}

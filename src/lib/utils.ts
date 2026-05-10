import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Format a date as DD-MM-YYYY (LTR). Accepts Date | string | null/undefined.
 * Returns "—" for empty/invalid.
 */
export function formatDateDMY(value: Date | string | null | undefined, fallback = "—"): string {
  if (value == null || value === "") return fallback;
  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else {
    const s = String(value);
    // Avoid timezone shift for plain YYYY-MM-DD strings
    if (ISO_DATE_RE.test(s)) {
      const [y, m, day] = s.slice(0, 10).split("-");
      return `${day}-${m}-${y}`;
    }
    d = new Date(s);
  }
  if (isNaN(d.getTime())) return fallback;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Format a date+time as DD-MM-YYYY HH:MM.
 */
export function formatDateTimeDMY(value: Date | string | null | undefined, fallback = "—"): string {
  if (value == null || value === "") return fallback;
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return fallback;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
}

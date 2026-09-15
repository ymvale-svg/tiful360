const TZ = "Asia/Jerusalem";

/** DD/MM/YYYY in Israel time. */
export function fmtDateIL(value: string | Date | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
}

/** DD/MM/YYYY HH:MM in Israel time. */
export function fmtDateTimeIL(value: string | Date | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return fallback;
  const date = fmtDateIL(d, fallback);
  const time = d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
}

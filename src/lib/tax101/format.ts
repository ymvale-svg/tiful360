/** Value → printed text helpers shared by the PDF builder and the on-screen form. */

/** "2026-03-07" → { dd: "07", mm: "03", yyyy: "2026" }; null when not an ISO date. */
export function splitIsoDate(iso: string | null | undefined): { dd: string; mm: string; yyyy: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  return { dd: m[3], mm: m[2], yyyy: m[1] };
}

/** "2026-03-07" → "07032026" (for 8 digit cells). */
export function dateToCells(iso: string | null | undefined): string {
  const d = splitIsoDate(iso);
  return d ? `${d.dd}${d.mm}${d.yyyy}` : "";
}

/** "2026-03-07" → "07/03/2026". */
export function formatDmy(iso: string | null | undefined): string {
  const d = splitIsoDate(iso);
  return d ? `${d.dd}/${d.mm}/${d.yyyy}` : "";
}

export function digitsOnly(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Splits an Israeli phone number around the printed "/":
 * mobile and 07x numbers get a 3-digit prefix, landlines a 2-digit one.
 */
export function splitPhone(v: string | null | undefined): { prefix: string; rest: string } {
  let d = digitsOnly(v);
  if (d.startsWith("972")) d = `0${d.slice(3)}`;
  if (!d) return { prefix: "", rest: "" };
  if (/^0[57]\d{8}$/.test(d)) return { prefix: d.slice(0, 3), rest: d.slice(3) };
  if (/^0\d{8}$/.test(d)) return { prefix: d.slice(0, 2), rest: d.slice(2) };
  return { prefix: "", rest: d };
}

/** Characters for digit cells; `skipFirst` drops the character the form already prints. */
export function cellChars(value: unknown, n: number, skipFirst = false): string[] {
  let s = String(value ?? "").replace(/\s/g, "");
  if (skipFirst && s.length > 0) s = s.slice(1);
  return Array.from(s).slice(0, n);
}

export function isMobileNumber(v: string | null | undefined): boolean {
  return /^05\d{8}$/.test(splitPhone(v).prefix + splitPhone(v).rest);
}

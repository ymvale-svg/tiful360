import { HDate } from "@hebcal/hdate";

// Strip Hebrew nikud (vowel points) and cantillation marks
function stripNikud(s: string): string {
  return s.replace(/[\u0591-\u05C7]/g, "");
}

// Base month list (numeric value 1-13). Order: Tishrei (start of civil year) -> Elul.
// Both Adar I and Adar II are always offered; in a non-leap year value 13 falls back
// to plain Adar via toHebcalMonth.
const BASE_HEBREW_MONTHS: { value: number; label: string }[] = [
  { value: 7, label: "תשרי" },
  { value: 8, label: "חשון" },
  { value: 9, label: "כסלו" },
  { value: 10, label: "טבת" },
  { value: 11, label: "שבט" },
  { value: 12, label: "אדר א'" },
  { value: 13, label: "אדר ב'" },
  { value: 1, label: "ניסן" },
  { value: 2, label: "אייר" },
  { value: 3, label: "סיון" },
  { value: 4, label: "תמוז" },
  { value: 5, label: "אב" },
  { value: 6, label: "אלול" },
];

// Backwards-compatible static export
export const HEBREW_MONTHS = BASE_HEBREW_MONTHS;

// Returns month list adapted to the supplied Hebrew year.
// Non-leap year: 12 -> "אדר" (Adar II option still shown but treated as plain Adar on save).
// Leap year: "אדר א'" / "אדר ב'".
export function getHebrewMonthsForYear(hyear: number | null | undefined): { value: number; label: string }[] {
  const leap = !!hyear && HDate.isLeapYear(hyear);
  return BASE_HEBREW_MONTHS.map((m) => {
    if (m.value === 12) return { value: 12, label: leap ? "אדר א'" : "אדר" };
    return m;
  });
}

// Map our 1-13 numbering to @hebcal numeric months.
function toHebcalMonth(month: number, hyear: number): number {
  const leap = HDate.isLeapYear(hyear);
  if (month === 13 && !leap) return 12;
  return month;
}

// Format day+month+year as Hebrew gematriya (e.g. "ט״ו ניסן תשמ״ה")
export function formatHebrewBirthGematriya(
  day: number,
  month: number,
  year: number
): string {
  try {
    const hd = new HDate(day, toHebcalMonth(month, year), year);
    return stripNikud(hd.renderGematriya());
  } catch {
    return "";
  }
}

// Today's date as Hebrew gematriya string
export function formatTodayHebrewGematriya(): string {
  try {
    return stripNikud(new HDate(new Date()).renderGematriya());
  } catch {
    return "";
  }
}

// ---------- Hebrew year parsing ----------

const LETTER_VALUES: Record<string, number> = {
  "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9,
  "י": 10, "כ": 20, "ך": 20, "ל": 30, "מ": 40, "ם": 40, "נ": 50, "ן": 50,
  "ס": 60, "ע": 70, "פ": 80, "ף": 80, "צ": 90, "ץ": 90,
  "ק": 100, "ר": 200, "ש": 300, "ת": 400,
};

// Parse Hebrew year written in gematriya (e.g. "תשמ"ה", "תשפ"ד", "ה'תשפ"ד") -> 5745.
// Returns null if cannot parse / contains non-Hebrew letters.
export function parseHebrewYearGematriya(text: string): number | null {
  if (!text) return null;
  // Remove punctuation: quotes, geresh, gershayim, apostrophes, spaces, nikud
  let s = stripNikud(text)
    .replace(/[״"׳'`’״\s\-־]/g, "")
    .trim();
  if (!s) return null;

  // Handle thousands prefix: ה' (5000), ו' (6000) — already stripped quotes.
  // If first letter is one of ה/ו AND length > 1, treat as thousands and strip.
  let thousands = 0;
  if (s.length > 1 && (s[0] === "ה" || s[0] === "ו" || s[0] === "ד")) {
    thousands = LETTER_VALUES[s[0]] * 1000;
    s = s.slice(1);
  }

  let sum = 0;
  for (const ch of s) {
    const v = LETTER_VALUES[ch];
    if (!v) return null;
    sum += v;
  }
  if (sum === 0) return null;

  let total = thousands + sum;
  // If no explicit thousands and result < 1000, assume 5000s.
  if (thousands === 0 && total < 1000) total += 5000;
  if (total < 5000 || total > 6000) return null;
  return total;
}

// Render a numeric Hebrew year (e.g. 5745) as gematriya without the thousands prefix
// (e.g. "תשמ"ה"). Uses hebcal's HDate.
export function formatHebrewYearGematriya(year: number): string {
  try {
    // Use 1 Tishrei of that year as a reference, then trim day/month parts.
    const hd = new HDate(1, 7, year);
    const full = stripNikud(hd.renderGematriya()); // e.g. "א׳ תשרי תשמ״ה"
    const parts = full.trim().split(/\s+/);
    return parts[parts.length - 1] || "";
  } catch {
    return "";
  }
}

// Parse Hebrew day written in gematriya (e.g. 'כ"ב', "ט\"ו", "א'") -> 1-30
export function parseHebrewDayGematriya(text: string): number | null {
  if (!text) return null;
  const s = stripNikud(text).replace(/[״"׳'`’״\s\-־]/g, "").trim();
  if (!s) return null;
  let sum = 0;
  for (const ch of s) {
    const v = LETTER_VALUES[ch];
    if (!v) return null;
    sum += v;
  }
  if (sum < 1 || sum > 30) return null;
  return sum;
}

// Render a numeric Hebrew day (1-30) as gematriya (e.g. 'כ"ב')
export function formatHebrewDayGematriya(day: number): string {
  try {
    const hd = new HDate(day, 7, 5785);
    const full = stripNikud(hd.renderGematriya());
    const parts = full.trim().split(/\s+/);
    return parts[0] || "";
  } catch {
    return "";
  }
}

// Compute the Gregorian Date this year for a Hebrew birthday
export function hebrewBirthdayGregorianThisYear(
  day: number,
  month: number,
  _originalYear: number
): Date | null {
  try {
    const today = new HDate(new Date());
    const hyear = today.getFullYear();
    let m = toHebcalMonth(month, hyear);
    const daysInMonth = HDate.daysInMonth(m, hyear);
    const d = Math.min(day, daysInMonth);
    return new HDate(d, m, hyear).greg();
  } catch {
    return null;
  }
}

const GREG_MONTHS_HE = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

export function formatGregorianBirthday(d: Date): string {
  return `${d.getDate()} ב${GREG_MONTHS_HE[d.getMonth()]}`;
}

export interface BirthdayEmployee {
  id: string;
  full_name: string;
  birth_date: string | null;
  birthday_calendar_preference: "gregorian" | "hebrew";
  hebrew_birth_day: number | null;
  hebrew_birth_month: number | null;
  hebrew_birth_year: number | null;
}

export interface ProcessedBirthday {
  id: string;
  full_name: string;
  effectiveDate: Date;
  label: string;
  isHebrew: boolean;
  isToday: boolean;
  isTomorrow: boolean;
}

export function processBirthdaysForCurrentMonth(
  rows: BirthdayEmployee[]
): ProcessedBirthday[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const month = today.getMonth();

  const out: ProcessedBirthday[] = [];
  for (const r of rows) {
    let eff: Date | null = null;
    let label = "";
    let isHebrew = false;

    if (r.birthday_calendar_preference === "hebrew"
        && r.hebrew_birth_day && r.hebrew_birth_month && r.hebrew_birth_year) {
      eff = hebrewBirthdayGregorianThisYear(
        r.hebrew_birth_day, r.hebrew_birth_month, r.hebrew_birth_year
      );
      label = formatHebrewBirthGematriya(
        r.hebrew_birth_day, r.hebrew_birth_month, r.hebrew_birth_year
      );
      isHebrew = true;
    } else if (r.birth_date) {
      const bd = new Date(r.birth_date);
      eff = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
      label = formatGregorianBirthday(eff);
    }

    if (!eff) continue;
    if (eff.getMonth() !== month) continue;

    const effMid = new Date(eff);
    effMid.setHours(0, 0, 0, 0);
    out.push({
      id: r.id,
      full_name: r.full_name,
      effectiveDate: eff,
      label,
      isHebrew,
      isToday: effMid.getTime() === today.getTime(),
      isTomorrow: effMid.getTime() === tomorrow.getTime(),
    });
  }

  out.sort((a, b) => a.effectiveDate.getDate() - b.effectiveDate.getDate());
  return out;
}

import { HDate } from "@hebcal/hdate";

// Strip Hebrew nikud (vowel points) and cantillation marks
function stripNikud(s: string): string {
  return s.replace(/[\u0591-\u05C7]/g, "");
}

// Hebrew month names in correct order (1-13 with Adar I/II support)
export const HEBREW_MONTHS: { value: number; label: string }[] = [
  { value: 1, label: "ניסן" },
  { value: 2, label: "אייר" },
  { value: 3, label: "סיון" },
  { value: 4, label: "תמוז" },
  { value: 5, label: "אב" },
  { value: 6, label: "אלול" },
  { value: 7, label: "תשרי" },
  { value: 8, label: "חשון" },
  { value: 9, label: "כסלו" },
  { value: 10, label: "טבת" },
  { value: 11, label: "שבט" },
  { value: 12, label: "אדר" },
  { value: 13, label: "אדר ב'" },
];

// Map our 1-13 numbering to @hebcal numeric months.
// @hebcal: Nisan=1..Elul=6, Tishrei=7, Cheshvan=8, Kislev=9, Tevet=10, Shevat=11, Adar I=12, Adar II=13.
// In a non-leap year, Adar I (12) falls back to plain Adar (12 in @hebcal).
function toHebcalMonth(month: number, hyear: number): number {
  const leap = HDate.isLeapYear(hyear);
  if (month === 13 && !leap) return 12; // Adar II in a non-leap year -> Adar
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

// Compute the Gregorian Date this year (or next year if already passed) for a Hebrew birthday
export function hebrewBirthdayGregorianThisYear(
  day: number,
  month: number,
  _originalYear: number
): Date | null {
  try {
    const today = new HDate(new Date());
    const hyear = today.getFullYear();
    let m = toHebcalMonth(month, hyear);
    // Clamp day if month is shorter that year
    const daysInMonth = HDate.daysInMonth(m, hyear);
    const d = Math.min(day, daysInMonth);
    return new HDate(d, m, hyear).greg();
  } catch {
    return null;
  }
}

// Gregorian month names in Hebrew
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
  effectiveDate: Date; // Gregorian date this year
  label: string; // Display text (Hebrew gematriya or Hebrew-Gregorian)
  isHebrew: boolean;
  isToday: boolean;
  isTomorrow: boolean;
}

// Process raw birthday rows: keep only those whose effective Gregorian date is in current month, sort ascending
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

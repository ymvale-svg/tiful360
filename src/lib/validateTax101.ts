import type { Tax101FormData } from "@/components/Tax101Dialog";

export type Tax101IssueLevel = "error" | "warning";

export interface Tax101Issue {
  level: Tax101IssueLevel;
  /** Hebrew label of the section this issue belongs to (matches the form's section letters). */
  section: string;
  /** Human-readable Hebrew message. */
  message: string;
  /** Step index (0-based) the user should jump to in order to fix it. */
  step: number;
  /** Stable code for testing / analytics. */
  code: string;
}

export interface Tax101ValidationResult {
  ok: boolean;
  errors: Tax101Issue[];
  warnings: Tax101Issue[];
}

// Steps in the wizard, kept in sync with STEPS in Tax101Dialog
const STEP = {
  PERSONAL: 0,
  ADDRESS: 1,
  CHILDREN: 2,
  INCOME: 3,
  COORDINATION: 4,
  SIGN: 5,
} as const;

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

const isValidIsraeliId = (id: string): boolean => {
  // Standard 9-digit Israeli ID Luhn-like check.
  const s = (id || "").replace(/\D/g, "");
  if (s.length < 5 || s.length > 9) return false;
  const padded = s.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = parseInt(padded[i], 10) * ((i % 2) + 1);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
};

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isValidIsraeliPhone = (s: string) => {
  const digits = (s || "").replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 11;
};
const isISODateInPast = (s: string) => !!s && !Number.isNaN(Date.parse(s)) && new Date(s) <= new Date();

/**
 * Cross-checks the form data against the official 0101/130 requirements:
 * which fields are mandatory, which conditional sub-fields are required when
 * a parent option is selected, and which fields the form rejects when
 * malformed (ID number, email, phone, dates).
 *
 * Errors block PDF export. Warnings are advisory but show in the UI.
 */
export function validateTax101(data: Tax101FormData): Tax101ValidationResult {
  const errors: Tax101Issue[] = [];
  const warnings: Tax101Issue[] = [];

  const err = (code: string, section: string, message: string, step: number) =>
    errors.push({ level: "error", code, section, message, step });
  const warn = (code: string, section: string, message: string, step: number) =>
    warnings.push({ level: "warning", code, section, message, step });

  // ===== ב. פרטי העובד/ת =====
  if (isBlank(data.first_name)) err("first_name", "ב", "שם פרטי חסר", STEP.PERSONAL);
  if (isBlank(data.last_name)) err("last_name", "ב", "שם משפחה חסר", STEP.PERSONAL);

  // Either ID number or passport is required; ID must pass checksum if present.
  if (isBlank(data.id_number) && isBlank(data.passport_number)) {
    err("id_or_passport", "ב", 'חובה למלא מס׳ ת"ז או מס׳ דרכון', STEP.PERSONAL);
  } else if (!isBlank(data.id_number) && !isValidIsraeliId(data.id_number)) {
    err("id_invalid", "ב", 'מס׳ תעודת זהות אינו תקין (לא עובר בדיקת ספרת ביקורת)', STEP.PERSONAL);
  }

  if (isBlank(data.gender)) err("gender", "ב", "יש לבחור מין", STEP.PERSONAL);
  if (isBlank(data.birth_date)) err("birth_date", "ב", "תאריך לידה חסר", STEP.PERSONAL);
  else if (!isISODateInPast(data.birth_date)) err("birth_date_future", "ב", "תאריך לידה לא תקין", STEP.PERSONAL);

  if (isBlank(data.country_of_birth)) warn("country_of_birth", "ב", "ארץ לידה לא מולאה", STEP.PERSONAL);
  if (data.is_israeli_resident === false && isBlank(data.aliyah_date)) {
    warn("aliyah_date", "ב", "מומלץ למלא תאריך עליה כאשר אינך תושב/ת ישראל", STEP.PERSONAL);
  }
  if (!isBlank(data.aliyah_date) && !isISODateInPast(data.aliyah_date)) {
    err("aliyah_date_future", "ב", "תאריך עליה אינו תקין", STEP.PERSONAL);
  }

  // Contact
  if (isBlank(data.phone) && isBlank(data.mobile_phone)) {
    err("phone_required", "ב", "יש למלא טלפון או נייד", STEP.PERSONAL);
  } else {
    if (!isBlank(data.phone) && !isValidIsraeliPhone(data.phone)) err("phone_invalid", "ב", "מס׳ טלפון אינו תקין", STEP.PERSONAL);
    if (!isBlank(data.mobile_phone) && !isValidIsraeliPhone(data.mobile_phone)) err("mobile_invalid", "ב", "מס׳ נייד אינו תקין", STEP.PERSONAL);
  }
  if (isBlank(data.email)) warn("email_missing", "ב", 'דוא"ל חסר — מומלץ לצורך אישור חתימה', STEP.PERSONAL);
  else if (!isValidEmail(data.email)) err("email_invalid", "ב", 'כתובת דוא"ל אינה תקינה', STEP.PERSONAL);

  // Address
  if (isBlank(data.street)) err("street", "ב", "רחוב חסר", STEP.ADDRESS);
  if (isBlank(data.house_number)) warn("house_number", "ב", 'מס׳ בית חסר', STEP.ADDRESS);
  if (isBlank(data.city)) err("city", "ב", "עיר/יישוב חסר", STEP.ADDRESS);
  if (isBlank(data.postal_code) && isBlank(data.po_box)) {
    warn("postal_or_pobox", "ב", "מומלץ למלא מיקוד או ת.ד.", STEP.ADDRESS);
  }

  // Marital status
  if (isBlank(data.marital_status)) err("marital_status", "ב", "יש לבחור מצב משפחתי", STEP.ADDRESS);

  // Health fund
  if (data.health_fund_member && isBlank(data.health_fund_name)) {
    err("health_fund_name", "ב", "יש למלא את שם קופת החולים", STEP.ADDRESS);
  }

  // Spouse fields when married
  if (data.marital_status === "married") {
    if (isBlank(data.spouse_first_name) || isBlank(data.spouse_last_name)) {
      err("spouse_name", "ב", "פרטי בן/בת זוג חסרים (שם)", STEP.ADDRESS);
    }
    if (isBlank(data.spouse_id) && isBlank(data.spouse_passport)) {
      err("spouse_id", "ב", 'יש למלא ת"ז או דרכון של בן/בת הזוג', STEP.ADDRESS);
    } else if (!isBlank(data.spouse_id) && !isValidIsraeliId(data.spouse_id)) {
      err("spouse_id_invalid", "ב", 'מס׳ ת"ז של בן/בת זוג אינו תקין', STEP.ADDRESS);
    }
    if (isBlank(data.spouse_income_status)) {
      err("spouse_income_status", "ב", "יש לציין סטטוס הכנסות של בן/בת הזוג", STEP.ADDRESS);
    }
    if (data.spouse_income_status === "has_income") {
      const s = data.spouse_income_sources;
      if (!s.work && !s.pension && !s.business) {
        err("spouse_income_source", "ב", "יש לבחור לפחות מקור הכנסה אחד עבור בן/בת הזוג", STEP.ADDRESS);
      }
    }
  }

  // ===== ג. ילדים =====
  data.dependents.forEach((d, i) => {
    if (isBlank(d.full_name)) err(`dep_${i}_name`, "ג", `שם הילד/ה בשורה ${i + 1} חסר`, STEP.CHILDREN);
    if (!isBlank(d.id_number) && !isValidIsraeliId(d.id_number)) {
      err(`dep_${i}_id`, "ג", `ת"ז של הילד/ה בשורה ${i + 1} אינו תקין`, STEP.CHILDREN);
    }
    if (isBlank(d.birth_date)) err(`dep_${i}_birth`, "ג", `תאריך לידה של הילד/ה בשורה ${i + 1} חסר`, STEP.CHILDREN);
    else if (!isISODateInPast(d.birth_date)) err(`dep_${i}_birth_invalid`, "ג", `תאריך לידה של הילד/ה בשורה ${i + 1} אינו תקין`, STEP.CHILDREN);
  });

  // ===== ד. הכנסות =====
  if (isBlank(data.income_type)) err("income_type", "ד", "יש לבחור סוג הכנסה", STEP.INCOME);
  if (isBlank(data.job_start_date)) err("job_start_date", "ד", "יש למלא תאריך תחילת עבודה בשנת המס", STEP.INCOME);

  // ===== ח. זיכויים =====
  const tc = data.tax_credits;
  // 2א — חייב לציין משך
  if (tc.blind_or_disabled && !tc.blind_or_disabled_period_at_least_year) {
    warn("disability_period", "ח", "סעיף 2א: יש לאשר תקופה של לפחות 185 יום בשנה", STEP.INCOME);
  }
  // 3 — יישוב מזכה
  if (tc.settlement_eligible && isBlank(tc.settlement_start_date)) {
    err("settlement_date", "ח", "סעיף 3: חסר תאריך תחילת תושבות ביישוב מזכה", STEP.INCOME);
  }
  // 4 — עולה חדש
  if (tc.new_immigrant && isBlank(data.aliyah_date)) {
    err("immigrant_aliyah_date", "ח", "סעיף 4 (עולה חדש): נדרש תאריך עליה (סעיף ב)", STEP.INCOME);
  }
  // 7 — ילדים בחזקתי
  const sumChildren = (vals: (number | "")[]): number => vals.reduce<number>((s, v) => s + (typeof v === "number" ? v : 0), 0);
  if (tc.children_in_custody) {
    const total = sumChildren([
      tc.children_in_custody_born_this_year,
      tc.children_in_custody_age_1,
      tc.children_in_custody_age_2_to_3,
      tc.children_in_custody_age_4_to_5,
      tc.children_in_custody_age_6_to_17,
      tc.children_in_custody_age_18,
    ]);
    if (total === 0) err("children_in_custody_count", "ח", "סעיף 7: סומן זיכוי על ילדים בחזקתי אך לא הוזנו מספרים בקבוצות הגיל", STEP.INCOME);
    const dependentsInCustody = data.dependents.filter(d => d.is_in_custody).length;
    if (dependentsInCustody > 0 && total !== dependentsInCustody) {
      warn(
        "children_in_custody_mismatch",
        "ח",
        `סעיף 7: סך הילדים בחזקתי בקבוצות הגיל (${total}) שונה ממספר הילדים שסומנו "בחזקתי" בחלק ג׳ (${dependentsInCustody})`,
        STEP.INCOME,
      );
    }
  }
  // 8 — ילדים שאינם בחזקתי
  if (tc.children_not_in_custody) {
    const total = sumChildren([
      tc.children_not_in_custody_born_this_year,
      tc.children_not_in_custody_age_1,
      tc.children_not_in_custody_age_2_to_3,
      tc.children_not_in_custody_age_4_to_5,
      tc.children_not_in_custody_age_6_to_17,
      tc.children_not_in_custody_age_18,
    ]);
    if (total === 0) err("children_not_in_custody_count", "ח", "סעיף 8: סומן זיכוי על ילדים שאינם בחזקתי אך לא הוזנו מספרים בקבוצות הגיל", STEP.INCOME);
  }
  // 13 — ילדים 16-18
  if (tc.child_aged_16_to_18 && (typeof tc.child_aged_16_to_18_count !== "number" || tc.child_aged_16_to_18_count <= 0)) {
    err("child_16_18_count", "ח", "סעיף 13: יש לציין מספר ילדים בני 16–18", STEP.INCOME);
  }
  // 14 — חייל משוחרר
  if (tc.discharged_soldier) {
    if (isBlank(tc.discharged_soldier_service_start_date) || isBlank(tc.discharged_soldier_service_end_date)) {
      err("soldier_dates", "ח", "סעיף 14: יש למלא תאריכי שירות מלאים (התחלה וסיום)", STEP.INCOME);
    } else if (new Date(tc.discharged_soldier_service_end_date) < new Date(tc.discharged_soldier_service_start_date)) {
      err("soldier_dates_order", "ח", "סעיף 14: תאריך סיום שירות חייב להיות אחרי תאריך התחלה", STEP.INCOME);
    }
  }
  // 15 — לימודים אקדמיים
  if (tc.academic_degree_completed && isBlank(tc.academic_degree_end_date)) {
    err("degree_end", "ח", "סעיף 15: יש למלא תאריך סיום לימודים אקדמיים", STEP.INCOME);
  }
  // 16 — לוחם מילואים
  if (tc.reservist_combat && (typeof tc.reservist_combat_days !== "number" || tc.reservist_combat_days <= 0)) {
    err("reservist_days", "ח", "סעיף 16: יש למלא מספר ימי שירות מילואים", STEP.INCOME);
  }
  // קונפליקט: 5 ו-6 לא יכולים להיות מסומנים יחד
  if (tc.single_parent_no_spouse_income && tc.single_parent_with_spouse_income) {
    err("credits_5_6_conflict", "ח", "סעיפים 5 ו-6 סותרים — לא ניתן לסמן את שניהם", STEP.INCOME);
  }

  // ===== ט. תיאום מס =====
  const co = data.tax_coordination;
  if (co.has_additional_employers) {
    if (co.additional_employers.length === 0) {
      err("coord_no_rows", "ט", "סעיף ט.2: סומן כי יש הכנסות נוספות אך לא נוספו מעסיקים", STEP.COORDINATION);
    }
    co.additional_employers.forEach((e, i) => {
      if (isBlank(e.employer_name)) err(`coord_${i}_name`, "ט", `סעיף ט.2 שורה ${i + 1}: חסר שם מעסיק`, STEP.COORDINATION);
      if (isBlank(e.income_type)) err(`coord_${i}_type`, "ט", `סעיף ט.2 שורה ${i + 1}: חסר סוג הכנסה`, STEP.COORDINATION);
      if (typeof e.monthly_gross !== "number" || e.monthly_gross <= 0) {
        err(`coord_${i}_gross`, "ט", `סעיף ט.2 שורה ${i + 1}: חסרה הכנסה חודשית תקינה`, STEP.COORDINATION);
      }
      if (typeof e.tax_withheld_percent !== "number" || e.tax_withheld_percent < 0 || e.tax_withheld_percent > 100) {
        warn(`coord_${i}_pct`, "ט", `סעיף ט.2 שורה ${i + 1}: אחוז המס שנוכה לא תקין (0-100)`, STEP.COORDINATION);
      }
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

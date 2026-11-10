import type { Tax101FormData } from "@/lib/tax101/types";

export type Tax101IssueLevel = "error" | "warning";

export interface Tax101Issue {
  level: Tax101IssueLevel;
  /** Section letter on the printed form. */
  section: string;
  /** Human-readable Hebrew message. */
  message: string;
  /** Form-data path of the field to fix (matches a field in src/lib/tax101/layout). */
  path: string;
  /** Stable code for testing / analytics. */
  code: string;
}

export interface Tax101ValidationResult {
  ok: boolean;
  errors: Tax101Issue[];
  warnings: Tax101Issue[];
}

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

export const isValidIsraeliId = (id: string): boolean => {
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
  return digits.length >= 9 && digits.length <= 12;
};
const isISODate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isISODateInPast = (s: string) => isISODate(s) && new Date(s) <= new Date();
const isRowEmpty = (row: object) =>
  Object.values(row).every((v) => v === "" || v === null || v === undefined || typeof v === "boolean");

/**
 * Cross-checks the form data against the official 0101/130 requirements.
 * Errors block signing; warnings are advisory.
 */
export function validateTax101(data: Tax101FormData): Tax101ValidationResult {
  const errors: Tax101Issue[] = [];
  const warnings: Tax101Issue[] = [];

  const err = (code: string, section: string, path: string, message: string) =>
    errors.push({ level: "error", code, section, path, message });
  const warn = (code: string, section: string, path: string, message: string) =>
    warnings.push({ level: "warning", code, section, path, message });

  // ===== ב. פרטי העובד/ת =====
  if (isBlank(data.id_number) && isBlank(data.passport_number)) {
    err("id_or_passport", "ב", "id_number", 'חובה למלא מספר זהות או מספר דרכון');
  } else if (!isBlank(data.id_number) && !isValidIsraeliId(data.id_number)) {
    err("id_invalid", "ב", "id_number", "מספר הזהות אינו תקין (ספרת ביקורת)");
  }
  if (isBlank(data.last_name)) err("last_name", "ב", "last_name", "שם משפחה חסר");
  if (isBlank(data.first_name)) err("first_name", "ב", "first_name", "שם פרטי חסר");
  if (isBlank(data.birth_date)) err("birth_date", "ב", "birth_date", "תאריך לידה חסר");
  else if (!isISODateInPast(data.birth_date)) err("birth_date_future", "ב", "birth_date", "תאריך הלידה אינו תקין");
  if (!isBlank(data.aliyah_date) && !isISODateInPast(data.aliyah_date)) {
    err("aliyah_date_future", "ב", "aliyah_date", "תאריך העליה אינו תקין");
  }

  if (isBlank(data.street)) err("street", "ב", "street", "רחוב חסר בכתובת");
  if (isBlank(data.city)) err("city", "ב", "city", "עיר/ישוב חסר בכתובת");
  if (isBlank(data.house_number)) warn("house_number", "ב", "house_number", "מספר בית חסר");
  if (isBlank(data.postal_code)) warn("postal_code", "ב", "postal_code", "מיקוד חסר");
  else if (!/^\d{7}$/.test(data.postal_code)) err("postal_code_invalid", "ב", "postal_code", "מיקוד צריך להיות 7 ספרות");

  if (isBlank(data.gender)) err("gender", "ב", "gender", "יש לסמן מין");
  if (isBlank(data.marital_status)) err("marital_status", "ב", "marital_status", "יש לסמן מצב משפחתי");
  if (isBlank(data.kibbutz_member)) err("kibbutz", "ב", "kibbutz_member", "יש לסמן אם את/ה חבר/ת קיבוץ או מושב שיתופי");
  if (data.health_fund_member && isBlank(data.health_fund_name)) {
    err("health_fund_name", "ב", "health_fund_name", "יש לכתוב את שם קופת החולים");
  }

  if (isBlank(data.phone) && isBlank(data.mobile_phone)) {
    err("phone_required", "ב", "mobile_phone", "יש למלא מספר טלפון או טלפון נייד");
  } else {
    if (!isBlank(data.phone) && !isValidIsraeliPhone(data.phone)) err("phone_invalid", "ב", "phone", "מספר הטלפון אינו תקין");
    if (!isBlank(data.mobile_phone) && !isValidIsraeliPhone(data.mobile_phone)) err("mobile_invalid", "ב", "mobile_phone", "מספר הנייד אינו תקין");
  }
  if (!isBlank(data.email) && !isValidEmail(data.email)) err("email_invalid", "ב", "email", 'כתובת הדוא"ל אינה תקינה');

  // ===== ג. ילדים =====
  data.dependents.forEach((d, i) => {
    if (isRowEmpty(d)) return;
    if (isBlank(d.full_name)) err(`dep_${i}_name`, "ג", `dependents.${i}.full_name`, `ילד בשורה ${i + 1}: חסר שם`);
    if (!isBlank(d.id_number) && !isValidIsraeliId(d.id_number)) {
      err(`dep_${i}_id`, "ג", `dependents.${i}.id_number`, `ילד בשורה ${i + 1}: מספר הזהות אינו תקין`);
    }
    if (isBlank(d.birth_date)) err(`dep_${i}_birth`, "ג", `dependents.${i}.birth_date`, `ילד בשורה ${i + 1}: חסר תאריך לידה`);
    else if (!isISODateInPast(d.birth_date)) err(`dep_${i}_birth_invalid`, "ג", `dependents.${i}.birth_date`, `ילד בשורה ${i + 1}: תאריך הלידה אינו תקין`);
  });

  // ===== ד. הכנסות ממעסיק זה =====
  if (isBlank(data.income_type)) err("income_type", "ד", "income_type", "יש לסמן את סוג ההכנסה ממעסיק זה");
  if (isBlank(data.job_start_date)) err("job_start_date", "ד", "job_start_date", "חסר תאריך תחילת העבודה בשנת המס");

  // ===== ה. הכנסות אחרות =====
  if (data.has_other_income) {
    if (!Object.values(data.other_income_types).some(Boolean)) {
      err("other_income_type", "ה", "other_income_types.monthly", "סומן שיש הכנסות אחרות — יש לסמן את סוג ההכנסה");
    }
    if (isBlank(data.other_income_credits)) {
      err("other_income_credits", "ה", "other_income_credits", "יש לסמן היכן מתקבלות נקודות הזיכוי (כאן או בהכנסה האחרת)");
    }
  }

  // ===== ו. בן/בת הזוג =====
  if (data.marital_status === "married") {
    if (isBlank(data.spouse_last_name)) err("spouse_last", "ו", "spouse_last_name", "חסר שם המשפחה של בן/בת הזוג");
    if (isBlank(data.spouse_first_name)) err("spouse_first", "ו", "spouse_first_name", "חסר השם הפרטי של בן/בת הזוג");
    if (isBlank(data.spouse_id) && isBlank(data.spouse_passport)) {
      err("spouse_id", "ו", "spouse_id", "יש למלא מספר זהות או דרכון של בן/בת הזוג");
    } else if (!isBlank(data.spouse_id) && !isValidIsraeliId(data.spouse_id)) {
      err("spouse_id_invalid", "ו", "spouse_id", "מספר הזהות של בן/בת הזוג אינו תקין");
    }
    if (isBlank(data.spouse_income_status)) err("spouse_income_status", "ו", "spouse_income_status", "יש לסמן אם יש לבן/בת הזוג הכנסה");
    if (data.spouse_income_status === "has_income" && !data.spouse_income_sources.work && !data.spouse_income_sources.other) {
      err("spouse_income_source", "ו", "spouse_income_sources.work", "יש לסמן את סוג ההכנסה של בן/בת הזוג");
    }
  }

  // ===== ז. שינויים במהלך השנה =====
  data.year_changes.forEach((c, i) => {
    if (isRowEmpty(c)) return;
    if (isBlank(c.details)) err(`chg_${i}_details`, "ז", `year_changes.${i}.details`, `שינוי ${i + 1}: חסרים פרטי השינוי`);
    if (isBlank(c.change_date)) err(`chg_${i}_date`, "ז", `year_changes.${i}.change_date`, `שינוי ${i + 1}: חסר תאריך השינוי`);
    if (isBlank(c.notification_date)) warn(`chg_${i}_notified`, "ז", `year_changes.${i}.notification_date`, `שינוי ${i + 1}: חסר תאריך ההודעה`);
  });

  // ===== ח. פטור / זיכוי =====
  const tc = data.tax_credits;
  if (tc.settlement_eligible) {
    if (isBlank(tc.settlement_start_date)) err("settlement_date", "ח", "tax_credits.settlement_start_date", "סעיף 3: חסר התאריך שממנו את/ה תושב/ת היישוב");
    if (isBlank(tc.settlement_name)) err("settlement_name", "ח", "tax_credits.settlement_name", "סעיף 3: חסר שם היישוב");
  }
  if (tc.new_immigrant && isBlank(data.aliyah_date)) {
    err("immigrant_aliyah_date", "ח", "aliyah_date", "סעיף 4: חסר תאריך העליה");
  }
  if (tc.spouse_no_income && data.marital_status !== "married") {
    warn("credit5_not_married", "ח", "tax_credits.spouse_no_income", "סעיף 5 מתייחס לבן/בת זוג — מצב משפחתי אינו נשוי/אה");
  }
  const sum = (vals: (number | "")[]) => vals.reduce<number>((s, v) => s + (typeof v === "number" ? v : 0), 0);
  if (tc.children_in_custody) {
    const total = sum([
      tc.children_in_custody_born_this_year,
      tc.children_in_custody_age_1_to_2,
      tc.children_in_custody_age_3,
      tc.children_in_custody_age_4_to_5,
      tc.children_in_custody_age_6_to_17,
      tc.children_in_custody_age_18,
    ]);
    if (total === 0) err("children_in_custody_count", "ח", "tax_credits.children_in_custody_age_6_to_17", "סעיף 7: יש למלא את מספר הילדים בכל קבוצת גיל");
  }
  if (tc.children_not_in_custody) {
    const total = sum([
      tc.children_not_in_custody_born_this_year,
      tc.children_not_in_custody_age_1_to_2,
      tc.children_not_in_custody_age_3,
      tc.children_not_in_custody_age_4_to_5,
      tc.children_not_in_custody_age_6_to_17,
    ]);
    if (total === 0) err("children_not_in_custody_count", "ח", "tax_credits.children_not_in_custody_age_6_to_17", "סעיף 8: יש למלא את מספר הילדים בכל קבוצת גיל");
  }
  if (tc.parent_to_disabled_child && !(typeof tc.parent_to_disabled_child_count === "number" && tc.parent_to_disabled_child_count > 0)) {
    err("disabled_children_count", "ח", "tax_credits.parent_to_disabled_child_count", "סעיף 11: חסר מספר הילדים");
  }
  if (tc.discharged_soldier) {
    if (isBlank(tc.discharged_soldier_service_start_date)) err("soldier_start", "ח", "tax_credits.discharged_soldier_service_start_date", "סעיף 14: חסר תאריך תחילת השירות");
    if (isBlank(tc.discharged_soldier_service_end_date)) err("soldier_end", "ח", "tax_credits.discharged_soldier_service_end_date", "סעיף 14: חסר תאריך סיום השירות");
    else if (!isBlank(tc.discharged_soldier_service_start_date) && tc.discharged_soldier_service_end_date < tc.discharged_soldier_service_start_date) {
      err("soldier_dates_order", "ח", "tax_credits.discharged_soldier_service_end_date", "סעיף 14: תאריך הסיום מוקדם מתאריך ההתחלה");
    }
  }
  if (tc.reservist_combat && !(typeof tc.reservist_combat_days === "number" && tc.reservist_combat_days > 0)) {
    err("reservist_days", "ח", "tax_credits.reservist_combat_days", "סעיף 16: חסר מספר ימי המילואים");
  }
  if (tc.spouse_no_income && data.spouse_income_status === "has_income") {
    err("credit5_conflict", "ח", "tax_credits.spouse_no_income", "סעיף 5 סותר את חלק ו׳ — סומן שלבן/בת הזוג יש הכנסה");
  }

  // ===== ט. תיאום מס =====
  const co = data.tax_coordination;
  if (co.has_additional_employers) {
    const rows = co.additional_employers.filter((r) => !isRowEmpty(r));
    if (rows.length === 0) {
      err("coord_no_rows", "ט", "tax_coordination.additional_employers.0.employer_name", "סעיף ט2: יש למלא את פרטי המעסיק/משלם המשכורת הנוסף");
    }
    co.additional_employers.forEach((e, i) => {
      if (isRowEmpty(e)) return;
      const p = `tax_coordination.additional_employers.${i}`;
      if (isBlank(e.employer_name)) err(`coord_${i}_name`, "ט", `${p}.employer_name`, `ט2 שורה ${i + 1}: חסר שם המעסיק`);
      if (isBlank(e.income_type)) err(`coord_${i}_type`, "ט", `${p}.income_type`, `ט2 שורה ${i + 1}: חסר סוג ההכנסה`);
      if (!(typeof e.monthly_gross === "number" && e.monthly_gross > 0)) {
        err(`coord_${i}_gross`, "ט", `${p}.monthly_gross`, `ט2 שורה ${i + 1}: חסרה הכנסה חודשית`);
      }
      if (!isBlank(e.tax_file_number) && !/^9\d{8}$/.test(e.tax_file_number)) {
        warn(`coord_${i}_file`, "ט", `${p}.tax_file_number`, `ט2 שורה ${i + 1}: מספר תיק ניכויים הוא 9 ספרות שמתחילות ב-9`);
      }
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

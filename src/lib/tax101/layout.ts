/**
 * Field map of the official Form 101 (0101/130), template TAX101_TEMPLATE_VERSION.
 *
 * Coordinates are PDF points measured from the TOP-LEFT of an A4 page
 * (595.275 × 841.89). They were measured from the template's own drawing
 * (digit-cell separators, ZapfDingbats checkbox glyphs, field rules), so the
 * same map drives both the on-screen overlay and the filled PDF.
 *
 * If the template PDF is replaced, re-measure and bump TAX101_TEMPLATE_VERSION.
 */
import type { Tax101FormData } from "./types";
import { TAX101_MAX_DEPENDENTS, TAX101_MAX_EMPLOYERS, TAX101_MAX_YEAR_CHANGES } from "./types";

export const TAX101_PAGE_WIDTH = 595.275;
export const TAX101_PAGE_HEIGHT = 841.89;

export interface Box {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

interface BaseField {
  /** Unique id, used for DOM ids and focus. */
  id: string;
  page: 0 | 1;
  /** Dot path into Tax101FormData. */
  path: string;
  /** Hebrew accessible name / missing-field label. */
  label: string;
  /** Section letter on the printed form. */
  section: string;
  /** Section א is filled by the employer — never editable by the employee. */
  employerOnly?: boolean;
  /** Shows the value of another field; not an input. */
  mirror?: boolean;
  /** Printed only while this boolean path is true (child counts under credits 7/8). */
  dependsOn?: string;
}

export interface TextField extends BaseField {
  kind: "text";
  x: number;
  w: number;
  top: number;
  h: number;
  size?: number;
  /** Numbers, e-mails, passport numbers: left-to-right input. */
  ltr?: boolean;
  numeric?: boolean;
  /** The printed form already shows the first character (tax-file "9"). */
  skipFirst?: boolean;
  /** Draw a check in this box when the value is a number > 0 (child-count rows). */
  box?: Box;
  maxLength?: number;
}

export interface CellsField extends BaseField {
  kind: "cells";
  /** Left edge of the first cell. */
  x: number;
  pitch: number;
  n: number;
  top: number;
  h: number;
  skipFirst?: boolean;
}

/** Date printed as DDMMYYYY into 8 digit cells. */
export interface DateCellsField extends BaseField {
  kind: "dateCells";
  x: number;
  pitch: number;
  top: number;
  h: number;
}

/** Date written on a line (or between the printed "/ /" when `slashes` is set). */
export interface DateLineField extends BaseField {
  kind: "dateLine";
  x: number;
  w: number;
  top: number;
  h: number;
  slashes?: [number, number];
}

/** Phone written around the printed "/" (prefix left of it, number right of it). */
export interface PhoneField extends BaseField {
  kind: "phone";
  x: number;
  w: number;
  slashX: number;
  top: number;
  h: number;
}

export interface CheckField extends BaseField {
  kind: "check";
  box: Box;
  /** Checked when the value at `path` equals this (radio). Default: `true` (boolean flag). */
  value?: string | boolean;
}

export type Tax101Field = TextField | CellsField | DateCellsField | DateLineField | PhoneField | CheckField;

const fields: Tax101Field[] = [];
const add = (f: Tax101Field) => fields.push(f);
const glyph = (x0: number, x1: number, top: number, bottom: number): Box => ({ x0, x1, top, bottom });

// ───────────────────────── Page 1 ─────────────────────────

// א. פרטי המעסיק
add({ id: "emp-name", kind: "text", page: 0, section: "א", path: "employer.name", label: "שם המעסיק", x: 418, w: 120, top: 165, h: 15, employerOnly: true });
add({ id: "emp-address", kind: "text", page: 0, section: "א", path: "employer.address", label: "כתובת המעסיק", x: 212, w: 202, top: 165, h: 15, employerOnly: true });
add({ id: "emp-phone", kind: "text", page: 0, section: "א", path: "employer.phone", label: "טלפון המעסיק", x: 132, w: 76, top: 165, h: 15, ltr: true, employerOnly: true });
add({ id: "emp-file", kind: "cells", page: 0, section: "א", path: "employer.tax_file_number", label: "מספר תיק ניכויים", x: 39.9, pitch: 11.3, n: 8, top: 168, h: 14, skipFirst: true, employerOnly: true });

// ב. פרטי העובד/ת
add({ id: "id", kind: "cells", page: 0, section: "ב", path: "id_number", label: "מספר זהות", x: 438.0, pitch: 11.35, n: 9, top: 221, h: 14 });
add({ id: "last", kind: "text", page: 0, section: "ב", path: "last_name", label: "שם משפחה", x: 316, w: 120, top: 221, h: 14 });
add({ id: "first", kind: "text", page: 0, section: "ב", path: "first_name", label: "שם פרטי", x: 212, w: 101, top: 221, h: 14 });
add({ id: "birth", kind: "dateCells", page: 0, section: "ב", path: "birth_date", label: "תאריך לידה", x: 119.2, pitch: 11.375, top: 221, h: 14 });
add({ id: "aliyah", kind: "dateCells", page: 0, section: "ב", path: "aliyah_date", label: "תאריך עליה", x: 28.4, pitch: 11.35, top: 221, h: 14 });
add({ id: "passport", kind: "text", page: 0, section: "ב", path: "passport_number", label: "מספר דרכון", x: 394, w: 145, top: 249, h: 13, ltr: true });
add({ id: "street", kind: "text", page: 0, section: "ב", path: "street", label: "רחוב/שכונה", x: 231, w: 107, top: 241, h: 12 });
add({ id: "house", kind: "text", page: 0, section: "ב", path: "house_number", label: "מספר בית", x: 204, w: 24, top: 240, h: 12, ltr: true });
add({ id: "city", kind: "text", page: 0, section: "ב", path: "city", label: "עיר/ישוב", x: 110, w: 91, top: 240, h: 12 });
add({ id: "zip", kind: "cells", page: 0, section: "ב", path: "postal_code", label: "מיקוד", x: 29, pitch: 11.35, n: 7, top: 241, h: 12 });

add({ id: "g-m", kind: "check", page: 0, section: "ב", path: "gender", value: "male", label: "מין: זכר", box: glyph(528.4, 536.8, 279.1, 290.1) });
add({ id: "g-f", kind: "check", page: 0, section: "ב", path: "gender", value: "female", label: "מין: נקבה", box: glyph(528.4, 536.8, 292.1, 303.1) });
add({ id: "ms-single", kind: "check", page: 0, section: "ב", path: "marital_status", value: "single", label: "מצב משפחתי: רווק/ה", box: glyph(489.3, 497.7, 277.8, 288.8) });
add({ id: "ms-married", kind: "check", page: 0, section: "ב", path: "marital_status", value: "married", label: "מצב משפחתי: נשוי/אה", box: glyph(430.2, 438.6, 277.8, 288.8) });
add({ id: "ms-divorced", kind: "check", page: 0, section: "ב", path: "marital_status", value: "divorced", label: "מצב משפחתי: גרוש/ה", box: glyph(362.9, 371.3, 277.8, 288.8) });
add({ id: "ms-widowed", kind: "check", page: 0, section: "ב", path: "marital_status", value: "widowed", label: "מצב משפחתי: אלמן/ה", box: glyph(489.3, 497.7, 290.8, 301.8) });
add({ id: "ms-separated", kind: "check", page: 0, section: "ב", path: "marital_status", value: "separated", label: "מצב משפחתי: פרוד/ה", box: glyph(442.5, 450.9, 290.8, 301.8) });
add({ id: "res-yes", kind: "check", page: 0, section: "ב", path: "is_israeli_resident", value: true, label: "תושב ישראל: כן", box: glyph(309.7, 318.1, 278.8, 289.8) });
add({ id: "res-no", kind: "check", page: 0, section: "ב", path: "is_israeli_resident", value: false, label: "תושב ישראל: לא", box: glyph(309.7, 318.1, 291.8, 302.8) });
add({ id: "kib-no", kind: "check", page: 0, section: "ב", path: "kibbutz_member", value: "no", label: "חבר קיבוץ/מושב שיתופי: לא", box: glyph(270.6, 278.2, 279.0, 289.0) });
add({ id: "kib-yes-t", kind: "check", page: 0, section: "ב", path: "kibbutz_member", value: "yes_transferred", label: "חבר קיבוץ: הכנסותיי מועברות לקיבוץ", box: glyph(248.6, 255.4, 279.9, 288.9) });
add({ id: "kib-yes-n", kind: "check", page: 0, section: "ב", path: "kibbutz_member", value: "yes_not_transferred", label: "חבר קיבוץ: הכנסותיי אינן מועברות לקיבוץ", box: glyph(270.6, 278.2, 292.0, 302.0) });
add({ id: "hf-no", kind: "check", page: 0, section: "ב", path: "health_fund_member", value: false, label: "חבר בקופת חולים: לא", box: glyph(123.2, 131.6, 277.2, 288.2) });
add({ id: "hf-yes", kind: "check", page: 0, section: "ב", path: "health_fund_member", value: true, label: "חבר בקופת חולים: כן", box: glyph(123.2, 131.6, 290.2, 301.2) });
add({ id: "hf-name", kind: "text", page: 0, section: "ב", path: "health_fund_name", label: "שם קופת החולים", x: 30, w: 40, top: 290, h: 11, size: 7.5 });
add({ id: "email", kind: "text", page: 0, section: "ב", path: "email", label: "כתובת דואר אלקטרוני", x: 363, w: 175, top: 314, h: 13, ltr: true });
add({ id: "phone", kind: "phone", page: 0, section: "ב", path: "phone", label: "מספר טלפון", x: 208, w: 152, slashX: 241, top: 310, h: 17 });
add({ id: "mobile", kind: "phone", page: 0, section: "ב", path: "mobile_phone", label: "מספר טלפון נייד", x: 30, w: 174, slashX: 75.3, top: 310, h: 17 });

// ג. ילדים — 13 printed rows
const CHILD_ROW_TOP = 380.2;
const CHILD_ROW_PITCH = 21.92;
for (let i = 0; i < TAX101_MAX_DEPENDENTS; i++) {
  const top = CHILD_ROW_TOP + CHILD_ROW_PITCH * i;
  const n = i + 1;
  add({ id: `dep-${i}-custody`, kind: "check", page: 0, section: "ג", path: `dependents.${i}.is_in_custody`, label: `ילד ${n}: נמצא בחזקתי`, box: glyph(531.6, 539.0, top + 6, top + 16) });
  add({ id: `dep-${i}-allowance`, kind: "check", page: 0, section: "ג", path: `dependents.${i}.receives_allowance`, label: `ילד ${n}: אני מקבל/ת בגינו קצבת ילדים`, box: glyph(522.2, 529.6, top + 6, top + 16) });
  add({ id: `dep-${i}-name`, kind: "text", page: 0, section: "ג", path: `dependents.${i}.full_name`, label: `ילד ${n}: שם`, x: 451, w: 69, top: top + 5, h: 15 });
  add({ id: `dep-${i}-id`, kind: "cells", page: 0, section: "ג", path: `dependents.${i}.id_number`, label: `ילד ${n}: מספר זהות`, x: 347.0, pitch: 11.29, n: 9, top: top + 5, h: 15 });
  add({ id: `dep-${i}-birth`, kind: "dateCells", page: 0, section: "ג", path: `dependents.${i}.birth_date`, label: `ילד ${n}: תאריך לידה`, x: 256.4, pitch: 11.325, top: top + 5, h: 15 });
}

// ד. הכנסות ממעסיק זה
const INCOME_ROWS: [Tax101FormData["income_type"], string, number][] = [
  ["monthly", "משכורת חודש", 357.1],
  ["monthly_additional", "משכורת בעד משרה נוספת", 369.1],
  ["partial", "משכורת חלקית", 381.1],
  ["daily", "שכר עבודה (עובד יומי)", 393.1],
  ["pension", "קצבה", 405.1],
  ["scholarship", "מלגה", 417.1],
];
for (const [value, label, top] of INCOME_ROWS) {
  add({ id: `inc-${value}`, kind: "check", page: 0, section: "ד", path: "income_type", value, label: `אני מקבל/ת: ${label}`, box: glyph(238.2, 246.6, top, top + 11) });
}
add({ id: "job-start", kind: "dateCells", page: 0, section: "ד", path: "job_start_date", label: "תאריך תחילת העבודה בשנת המס", x: 30.8, pitch: 11.33, top: 375, h: 14 });

// ה. הכנסות אחרות
add({ id: "oi-no", kind: "check", page: 0, section: "ה", path: "has_other_income", value: false, label: "אין לי הכנסות אחרות", box: glyph(236.5, 244.9, 453.8, 464.8) });
add({ id: "oi-yes", kind: "check", page: 0, section: "ה", path: "has_other_income", value: true, label: "יש לי הכנסות אחרות", box: glyph(236.5, 244.9, 478.2, 489.2) });
const OTHER_INCOME: [string, string, number, number][] = [
  ["monthly", "משכורת חודש", 236.5, 490.1],
  ["monthly_additional", "משכורת בעד משרה נוספת", 236.5, 501.1],
  ["partial", "משכורת חלקית", 236.5, 512.1],
  ["daily", "שכר עבודה (עובד יומי)", 118.6, 490.1],
  ["pension", "קצבה", 118.6, 501.1],
  ["scholarship", "מלגה", 118.6, 512.1],
];
for (const [key, label, x0, top] of OTHER_INCOME) {
  add({ id: `oi-${key}`, kind: "check", page: 0, section: "ה", path: `other_income_types.${key}`, label: `הכנסה אחרת: ${label}`, box: glyph(x0, x0 + 8.4, top, top + 11) });
}
add({ id: "oi-credits-here", kind: "check", page: 0, section: "ה", path: "other_income_credits", value: "request_here", label: "אבקש לקבל נקודות זיכוי ומדרגות מס כנגד הכנסתי זו", box: glyph(235.5, 243.8, 535.8, 546.8) });
add({ id: "oi-credits-else", kind: "check", page: 0, section: "ה", path: "other_income_credits", value: "receive_elsewhere", label: "אני מקבל/ת נקודות זיכוי ומדרגות מס בהכנסה אחרת", box: glyph(235.5, 243.9, 559.1, 570.1) });
add({ id: "oi-study", kind: "check", page: 0, section: "ה", path: "no_study_fund_elsewhere", label: "אין מפרישים עבורי לקרן השתלמות בגין הכנסתי האחרת", box: glyph(235.6, 243.9, 583.4, 594.4) });
add({ id: "oi-no-pension", kind: "check", page: 0, section: "ה", path: "no_pension_elsewhere", label: "אין מפרישים עבורי לקצבה/לביטוח אובדן כושר עבודה בגין הכנסתי האחרת", box: glyph(235.5, 243.9, 617.7, 628.7) });

// ו. בן/בת הזוג
add({ id: "sp-id", kind: "cells", page: 0, section: "ו", path: "spouse_id", label: "בן/בת זוג: מספר זהות", x: 437.8, pitch: 11.35, n: 9, top: 695, h: 15 });
add({ id: "sp-last", kind: "text", page: 0, section: "ו", path: "spouse_last_name", label: "בן/בת זוג: שם משפחה", x: 316, w: 120, top: 695, h: 15 });
add({ id: "sp-first", kind: "text", page: 0, section: "ו", path: "spouse_first_name", label: "בן/בת זוג: שם פרטי", x: 212, w: 101, top: 695, h: 15 });
add({ id: "sp-birth", kind: "dateCells", page: 0, section: "ו", path: "spouse_birth_date", label: "בן/בת זוג: תאריך לידה", x: 119.4, pitch: 11.35, top: 695, h: 15 });
add({ id: "sp-aliyah", kind: "dateCells", page: 0, section: "ו", path: "spouse_aliyah_date", label: "בן/בת זוג: תאריך עליה", x: 28.7, pitch: 11.34, top: 695, h: 15 });
add({ id: "sp-passport", kind: "text", page: 0, section: "ו", path: "spouse_passport", label: "בן/בת זוג: מספר דרכון", x: 423, w: 115, top: 721, h: 13, ltr: true });
add({ id: "sp-noinc", kind: "check", page: 0, section: "ו", path: "spouse_income_status", value: "no_income", label: "אין לבן/בת הזוג כל הכנסה", box: glyph(409.8, 418.9, 715.6, 727.6) });
add({ id: "sp-inc", kind: "check", page: 0, section: "ו", path: "spouse_income_status", value: "has_income", label: "יש לבן/בת הזוג הכנסה", box: glyph(282.4, 291.6, 715.6, 727.6) });
add({ id: "sp-inc-work", kind: "check", page: 0, section: "ו", path: "spouse_income_sources.work", label: "הכנסת בן/בת הזוג: עבודה/קצבה/עסק", box: glyph(160.1, 167.7, 717.2, 727.2) });
add({ id: "sp-inc-other", kind: "check", page: 0, section: "ו", path: "spouse_income_sources.other", label: "הכנסת בן/בת הזוג: הכנסה אחרת", box: glyph(80.7, 88.3, 717.2, 727.2) });

// ז. שינויים במהלך השנה — 3 printed rows
export const YEAR_CHANGE_ROW_TOP = 768.3;
export const YEAR_CHANGE_ROW_PITCH = 17;
for (let r = 0; r < TAX101_MAX_YEAR_CHANGES; r++) {
  const top = YEAR_CHANGE_ROW_TOP + YEAR_CHANGE_ROW_PITCH * r + 2;
  const n = r + 1;
  add({ id: `chg-${r}-date`, kind: "dateLine", page: 0, section: "ז", path: `year_changes.${r}.change_date`, label: `שינוי ${n}: תאריך השינוי`, x: 486, w: 52, top, h: 13 });
  add({ id: `chg-${r}-details`, kind: "text", page: 0, section: "ז", path: `year_changes.${r}.details`, label: `שינוי ${n}: פרטי השינוי`, x: 192, w: 290, top, h: 13 });
  add({ id: `chg-${r}-notified`, kind: "dateLine", page: 0, section: "ז", path: `year_changes.${r}.notification_date`, label: `שינוי ${n}: תאריך ההודעה`, x: 119, w: 69, top, h: 13, slashes: [145.8, 158.9] });
}
/** Section ז signature cell (left column), per row. */
export const YEAR_CHANGE_SIGNATURE_X = { x0: 31, x1: 115 };

// ───────────────────────── Page 2 ─────────────────────────

add({ id: "p2-id", kind: "text", page: 1, section: "ח", path: "id_number", label: "מספר זהות", x: 96, w: 74, top: 16, h: 11, ltr: true, mirror: true });

const credit = (id: string, path: string, label: string, top: number, x0 = 510.7) =>
  add({ id, kind: "check", page: 1, section: "ח", path, label, box: glyph(x0, x0 + 10.7, top, top + 14) });

credit("c1", "tax_credits.israeli_resident", "ח1: אני תושב/ת ישראל", 39.3);
credit("c2a", "tax_credits.blind_or_disabled", "ח2א: נכה 100% / עיוור/ת לצמיתות", 54.6);
credit("c2b", "tax_credits.disability_compensation_recipient", "ח2ב: מקבל/ת תגמול חודשי לפי חוק הנכים / נפגעי איבה", 77.1);
credit("c3", "tax_credits.settlement_eligible", "ח3: תושב/ת קבע ביישוב מזכה", 94.8);
add({ id: "c3-date", kind: "dateLine", page: 1, section: "ח", path: "tax_credits.settlement_start_date", label: "ח3: מתאריך", x: 256, w: 74, top: 94, h: 12 });
add({ id: "c3-name", kind: "text", page: 1, section: "ח", path: "tax_credits.settlement_name", label: "ח3: שם היישוב", x: 297, w: 143, top: 106, h: 12 });
credit("c4", "tax_credits.new_immigrant", "ח4: עולה חדש/ה", 121.5, 511.7);
add({ id: "c4-date", kind: "dateLine", page: 1, section: "ח", path: "aliyah_date", label: "ח4: עולה חדש/ה מתאריך", x: 333, w: 74, top: 120, h: 12 });
add({ id: "c4-until", kind: "dateLine", page: 1, section: "ח", path: "tax_credits.new_immigrant_no_income_until", label: "ח4: לא היתה לי הכנסה בישראל עד תאריך", x: 192, w: 58, top: 133, h: 12 });
credit("c5", "tax_credits.spouse_no_income", "ח5: בגין בן/בת זוגי המתגורר/ת עימי ואין לו/לה הכנסות", 160.9);
credit("c6", "tax_credits.single_parent_family", "ח6: הורה במשפחה חד הורית", 183.3);
credit("c7", "tax_credits.children_in_custody", "ח7: בגין ילדיי שבחזקתי", 206.9);

const count = (id: string, path: string, label: string, x: number, top: number, box: Box) =>
  add({
    id, kind: "text", page: 1, section: "ח", path, label, x, w: 22, top, h: 11, ltr: true, numeric: true, maxLength: 2, box,
    dependsOn: path.includes("not_in_custody") ? "tax_credits.children_not_in_custody" : "tax_credits.children_in_custody",
  });

count("c7-0", "tax_credits.children_in_custody_born_this_year", "ח7: מספר ילדים שנולדו בשנת המס", 369, 229, glyph(498.8, 506.4, 230.2, 240.2));
count("c7-1", "tax_credits.children_in_custody_age_1_to_2", "ח7: ילדים שימלאו להם שנה עד שנתיים", 281, 241, glyph(498.8, 506.4, 242.1, 252.1));
count("c7-3", "tax_credits.children_in_custody_age_3", "ח7: ילדים שימלאו להם 3 שנים", 324.5, 252, glyph(498.8, 506.4, 253.5, 263.5));
count("c7-4", "tax_credits.children_in_custody_age_4_to_5", "ח7: ילדים שימלאו להם 4 עד 5 שנים", 44, 230, glyph(256.4, 264.1, 232.1, 242.1));
count("c7-6", "tax_credits.children_in_custody_age_6_to_17", "ח7: ילדים שימלאו להם 6 עד 17 שנים", 40.5, 241, glyph(256.4, 264.1, 242.1, 252.1));
count("c7-18", "tax_credits.children_in_custody_age_18", "ח7: ילדים שימלאו להם 18 שנים", 78.5, 252, glyph(256.1, 263.8, 253.0, 263.0));

credit("c8", "tax_credits.children_not_in_custody", "ח8: בגין ילדיי הפעוטים שאינם בחזקתי", 265.4);
count("c8-0", "tax_credits.children_not_in_custody_born_this_year", "ח8: מספר ילדים שנולדו בשנת המס", 369, 276, glyph(498.8, 506.4, 277.7, 287.7));
count("c8-1", "tax_credits.children_not_in_custody_age_1_to_2", "ח8: ילדים שימלאו להם שנה עד שנתיים", 281, 287, glyph(498.8, 506.4, 289.6, 299.6));
count("c8-3", "tax_credits.children_not_in_custody_age_3", "ח8: ילדים שימלאו להם 3 שנים", 324.5, 299, glyph(498.8, 506.4, 301.0, 311.0));
count("c8-4", "tax_credits.children_not_in_custody_age_4_to_5", "ח8: ילדים שימלאו להם 4 עד 5 שנים", 44, 276, glyph(256.4, 264.1, 279.7, 289.7));
count("c8-6", "tax_credits.children_not_in_custody_age_6_to_17", "ח8: ילדים שימלאו להם 6 עד 17 שנים", 40.5, 287, glyph(256.4, 264.1, 289.6, 299.6));

credit("c9", "tax_credits.single_parent", "ח9: אני הורה יחיד לילדיי שבחזקתי", 314.9);
credit("c10", "tax_credits.children_with_alimony", "ח10: בגין ילדיי שאינם בחזקתי ואני משתתף/ת בכלכלתם", 332.9);
credit("c11", "tax_credits.parent_to_disabled_child", "ח11: הורה לילדים עם מוגבלות", 357.8, 510.6);
add({ id: "c11-count", kind: "text", page: 1, section: "ח", path: "tax_credits.parent_to_disabled_child_count", label: "ח11: מספר הילדים", x: 449.5, w: 19, top: 355, h: 11, ltr: true, numeric: true, maxLength: 2 });
credit("c12", "tax_credits.alimony_to_ex_spouse", "ח12: בגין מזונות לבן/בת זוגי לשעבר", 380.6);
credit("c13", "tax_credits.child_aged_16_to_18", "ח13: מלאו לי או לבן/בת זוגי 16 שנים וטרם מלאו 18", 397.0);
credit("c14", "tax_credits.discharged_soldier", "ח14: חייל/ת משוחרר/ת או שירות לאומי", 412.0);
add({ id: "c14-start", kind: "dateLine", page: 1, section: "ח", path: "tax_credits.discharged_soldier_service_start_date", label: "ח14: תאריך תחילת השירות", x: 194, w: 56, top: 411, h: 11 });
add({ id: "c14-end", kind: "dateLine", page: 1, section: "ח", path: "tax_credits.discharged_soldier_service_end_date", label: "ח14: תאריך סיום השירות", x: 60, w: 59, top: 411, h: 11 });
credit("c15", "tax_credits.academic_degree_completed", "ח15: סיום לימודים לתואר אקדמי / התמחות / מקצוע", 436.1);
credit("c16", "tax_credits.reservist_combat", "ח16: שירתתי כלוחם/ת מילואים", 449.4);
add({ id: "c16-days", kind: "text", page: 1, section: "ח", path: "tax_credits.reservist_combat_days", label: "ח16: מספר ימי מילואים", x: 343, w: 21, top: 447, h: 11, ltr: true, numeric: true, maxLength: 3 });

// ט. תיאום מס
const coord = (id: string, path: string, label: string, top: number) =>
  add({ id, kind: "check", page: 1, section: "ט", path, label, box: glyph(512.4, 523.1, top, top + 14) });
coord("t1", "tax_coordination.no_income_until_start", "ט1: לא היתה לי הכנסה מתחילת שנת המס עד תחילת עבודתי אצל מעסיק זה", 479.4);
coord("t2", "tax_coordination.has_additional_employers", "ט2: יש לי הכנסות נוספות ממשכורת כמפורט", 508.3);
coord("t3", "tax_coordination.assessor_approval", "ט3: פקיד השומה אישר תיאום לפי אישור מצורף", 589.0);
const COORD_ROW_TOPS = [546.1, 560.8, 574.7];
for (let r = 0; r < TAX101_MAX_EMPLOYERS; r++) {
  const top = COORD_ROW_TOPS[r] + 1;
  const p = `tax_coordination.additional_employers.${r}`;
  const n = r + 1;
  add({ id: `co-${r}-name`, kind: "text", page: 1, section: "ט", path: `${p}.employer_name`, label: `מעסיק נוסף ${n}: שם`, x: 447, w: 91, top, h: 12, size: 8 });
  add({ id: `co-${r}-addr`, kind: "text", page: 1, section: "ט", path: `${p}.employer_address`, label: `מעסיק נוסף ${n}: כתובת`, x: 312, w: 131, top, h: 12, size: 8 });
  add({ id: `co-${r}-file`, kind: "text", page: 1, section: "ט", path: `${p}.tax_file_number`, label: `מעסיק נוסף ${n}: מספר תיק ניכויים`, x: 241, w: 68, top, h: 12, size: 8, ltr: true, skipFirst: true, maxLength: 9 });
  add({ id: `co-${r}-type`, kind: "text", page: 1, section: "ט", path: `${p}.income_type`, label: `מעסיק נוסף ${n}: סוג ההכנסה`, x: 175, w: 55, top, h: 12, size: 8 });
  add({ id: `co-${r}-gross`, kind: "text", page: 1, section: "ט", path: `${p}.monthly_gross`, label: `מעסיק נוסף ${n}: הכנסה חודשית`, x: 102, w: 70, top, h: 12, size: 8, ltr: true, numeric: true });
  add({ id: `co-${r}-tax`, kind: "text", page: 1, section: "ט", path: `${p}.tax_withheld`, label: `מעסיק נוסף ${n}: המס שנוכה`, x: 30, w: 69, top, h: 12, size: 8, ltr: true, numeric: true });
}

/** Header "שנת המס" — 4 digit cells on page 1. */
export const TAX_YEAR_CELLS = { x: 220.4, pitch: 16.225, n: 4, top: 82, h: 13 };
/** Section י declaration: date line and signature line on page 2. */
export const DECLARATION = {
  date: { x: 141, w: 86, top: 641, h: 13 },
  signature: { x0: 34, x1: 122, top: 618, bottom: 652 },
};

export const TAX101_FIELDS: readonly Tax101Field[] = fields;

export function fieldBounds(f: Tax101Field): Box {
  switch (f.kind) {
    case "check":
      return f.box;
    case "cells":
      return { x0: f.x, x1: f.x + f.pitch * f.n, top: f.top, bottom: f.top + f.h };
    case "dateCells":
      return { x0: f.x, x1: f.x + f.pitch * 8, top: f.top, bottom: f.top + f.h };
    default:
      return { x0: f.x, x1: f.x + f.w, top: f.top, bottom: f.top + f.h };
  }
}

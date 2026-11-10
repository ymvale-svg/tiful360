/**
 * Data model of the official Form 101 (0101/130).
 *
 * Stored as `tax_form_101.form_data`. The section letters in comments match the
 * printed form. Older rows may miss newer keys, so always read stored data
 * through `mergeTax101Form`, never cast it directly.
 */

/** Current printed template. Bump when the PDF in src/assets/forms/tax101 is replaced. */
export const TAX101_TEMPLATE_VERSION = "0101-130-2025-11";

export interface Tax101Dependent {
  full_name: string;
  id_number: string;
  birth_date: string;
  /** Column 1 — the child is in my custody. */
  is_in_custody: boolean;
  /** Column 2 — I receive the National Insurance child allowance for this child. */
  receives_allowance: boolean;
}

export interface Tax101AdditionalEmployer {
  employer_name: string;
  employer_address: string;
  /** Withholding file number (9 digits, the printed form already shows the leading 9). */
  tax_file_number: string;
  income_type: string;
  monthly_gross: number | "";
  /** Tax withheld (₪) — the form's "המס שנוכה" column. */
  tax_withheld: number | "";
}

export interface Tax101YearChange {
  change_date: string;
  details: string;
  notification_date: string;
}

export type Tax101IncomeType =
  | "monthly"
  | "monthly_additional"
  | "partial"
  | "daily"
  | "pension"
  | "scholarship"
  | "";

export interface Tax101Employer {
  name: string;
  address: string;
  phone: string;
  /** 9-digit withholding file number (תיק ניכויים). */
  tax_file_number: string;
}

export interface Tax101FormData {
  // א. פרטי המעסיק
  employer: Tax101Employer;

  // ב. פרטי העובד/ת
  first_name: string;
  last_name: string;
  id_number: string;
  passport_number: string;
  gender: "male" | "female" | "";
  birth_date: string;
  country_of_birth: string;
  aliyah_date: string;
  phone: string;
  mobile_phone: string;
  email: string;
  street: string;
  house_number: string;
  city: string;
  postal_code: string;
  po_box: string;
  marital_status: "single" | "married" | "divorced" | "widowed" | "separated" | "";
  is_israeli_resident: boolean;
  health_fund_member: boolean;
  health_fund_name: string;
  kibbutz_member: "no" | "yes_transferred" | "yes_not_transferred" | "";

  // ו. בן/בת הזוג
  spouse_last_name: string;
  spouse_first_name: string;
  spouse_id: string;
  spouse_passport: string;
  spouse_birth_date: string;
  spouse_aliyah_date: string;
  spouse_income_status: "no_income" | "has_income" | "";
  spouse_income_sources: { work: boolean; pension: boolean; business: boolean; other: boolean };

  // ג. ילדים
  dependents: Tax101Dependent[];

  // ד. הכנסות ממעסיק זה
  income_type: Tax101IncomeType;
  job_start_date: string;

  // ה. הכנסות אחרות
  has_other_income: boolean;
  other_income_types: {
    monthly: boolean;
    monthly_additional: boolean;
    partial: boolean;
    daily: boolean;
    pension: boolean;
    scholarship: boolean;
  };
  /** "request_here": credits against this income; "receive_elsewhere": I get them at the other income. */
  other_income_credits: "request_here" | "receive_elsewhere" | "";
  no_study_fund_elsewhere: boolean;
  no_pension_elsewhere: boolean;

  // ז. שינויים במהלך השנה
  year_changes: Tax101YearChange[];

  // ח. פטור או זיכוי ממס
  tax_credits: {
    israeli_resident: boolean; // 1
    blind_or_disabled: boolean; // 2א
    disability_compensation_recipient: boolean; // 2ב
    settlement_eligible: boolean; // 3
    settlement_start_date: string;
    settlement_name: string;
    new_immigrant: boolean; // 4
    new_immigrant_no_income_until: string;
    spouse_no_income: boolean; // 5
    single_parent_family: boolean; // 6
    children_in_custody: boolean; // 7
    children_in_custody_born_this_year: number | "";
    children_in_custody_age_1_to_2: number | "";
    children_in_custody_age_3: number | "";
    children_in_custody_age_4_to_5: number | "";
    children_in_custody_age_6_to_17: number | "";
    children_in_custody_age_18: number | "";
    children_not_in_custody: boolean; // 8
    children_not_in_custody_born_this_year: number | "";
    children_not_in_custody_age_1_to_2: number | "";
    children_not_in_custody_age_3: number | "";
    children_not_in_custody_age_4_to_5: number | "";
    children_not_in_custody_age_6_to_17: number | "";
    single_parent: boolean; // 9
    children_with_alimony: boolean; // 10
    parent_to_disabled_child: boolean; // 11
    parent_to_disabled_child_count: number | "";
    alimony_to_ex_spouse: boolean; // 12
    child_aged_16_to_18: boolean; // 13
    discharged_soldier: boolean; // 14
    discharged_soldier_service_start_date: string;
    discharged_soldier_service_end_date: string;
    academic_degree_completed: boolean; // 15
    reservist_combat: boolean; // 16
    reservist_combat_days: number | "";
  };

  // ט. תיאום מס
  tax_coordination: {
    no_income_until_start: boolean;
    has_additional_employers: boolean;
    additional_employers: Tax101AdditionalEmployer[];
    assessor_approval: boolean;
  };
}

/** Printed rows available on the form for each repeating table. */
export const TAX101_MAX_DEPENDENTS = 13;
export const TAX101_MAX_EMPLOYERS = 3;
export const TAX101_MAX_YEAR_CHANGES = 3;

export const emptyDependent = (): Tax101Dependent => ({
  full_name: "",
  id_number: "",
  birth_date: "",
  is_in_custody: true,
  receives_allowance: false,
});

export const emptyEmployer = (): Tax101AdditionalEmployer => ({
  employer_name: "",
  employer_address: "",
  tax_file_number: "",
  income_type: "",
  monthly_gross: "",
  tax_withheld: "",
});

export const emptyYearChange = (): Tax101YearChange => ({ change_date: "", details: "", notification_date: "" });

export function emptyTax101Form(): Tax101FormData {
  return {
    employer: { name: "", address: "", phone: "", tax_file_number: "" },
    first_name: "",
    last_name: "",
    id_number: "",
    passport_number: "",
    gender: "",
    birth_date: "",
    country_of_birth: "",
    aliyah_date: "",
    phone: "",
    mobile_phone: "",
    email: "",
    street: "",
    house_number: "",
    city: "",
    postal_code: "",
    po_box: "",
    marital_status: "",
    is_israeli_resident: true,
    health_fund_member: true,
    health_fund_name: "",
    kibbutz_member: "",
    spouse_last_name: "",
    spouse_first_name: "",
    spouse_id: "",
    spouse_passport: "",
    spouse_birth_date: "",
    spouse_aliyah_date: "",
    spouse_income_status: "",
    spouse_income_sources: { work: false, pension: false, business: false, other: false },
    dependents: [],
    income_type: "",
    job_start_date: "",
    has_other_income: false,
    other_income_types: {
      monthly: false,
      monthly_additional: false,
      partial: false,
      daily: false,
      pension: false,
      scholarship: false,
    },
    other_income_credits: "",
    no_study_fund_elsewhere: false,
    no_pension_elsewhere: false,
    year_changes: [],
    tax_credits: {
      israeli_resident: true,
      blind_or_disabled: false,
      disability_compensation_recipient: false,
      settlement_eligible: false,
      settlement_start_date: "",
      settlement_name: "",
      new_immigrant: false,
      new_immigrant_no_income_until: "",
      spouse_no_income: false,
      single_parent_family: false,
      children_in_custody: false,
      children_in_custody_born_this_year: "",
      children_in_custody_age_1_to_2: "",
      children_in_custody_age_3: "",
      children_in_custody_age_4_to_5: "",
      children_in_custody_age_6_to_17: "",
      children_in_custody_age_18: "",
      children_not_in_custody: false,
      children_not_in_custody_born_this_year: "",
      children_not_in_custody_age_1_to_2: "",
      children_not_in_custody_age_3: "",
      children_not_in_custody_age_4_to_5: "",
      children_not_in_custody_age_6_to_17: "",
      single_parent: false,
      children_with_alimony: false,
      parent_to_disabled_child: false,
      parent_to_disabled_child_count: "",
      alimony_to_ex_spouse: false,
      child_aged_16_to_18: false,
      discharged_soldier: false,
      discharged_soldier_service_start_date: "",
      discharged_soldier_service_end_date: "",
      academic_degree_completed: false,
      reservist_combat: false,
      reservist_combat_days: "",
    },
    tax_coordination: {
      no_income_until_start: false,
      has_additional_employers: false,
      additional_employers: [],
      assessor_approval: false,
    },
  };
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Deep-merges stored or draft data onto a base form. Only keys that exist in
 * the base are taken, and only when the stored value has the same shape, so a
 * draft saved by an older version can never inject unknown fields.
 */
export function mergeTax101Form(base: Tax101FormData, patch: unknown): Tax101FormData {
  const merge = (b: unknown, p: unknown): unknown => {
    if (p === undefined || p === null) return b;
    if (Array.isArray(b)) return Array.isArray(p) ? p : b;
    if (isPlainObject(b)) {
      if (!isPlainObject(p)) return b;
      const out: Record<string, unknown> = { ...b };
      for (const k of Object.keys(b)) out[k] = merge(b[k], p[k]);
      return out;
    }
    if (typeof b === "number" || b === "") {
      // number | "" fields, and string fields that are empty in the base
      if (typeof p === "number" || typeof p === "string") return p;
      return b;
    }
    return typeof p === typeof b ? p : b;
  };
  const out = merge(base, patch) as Tax101FormData;
  const rows = <T,>(list: unknown[], empty: () => T, max: number): T[] =>
    list.slice(0, max).map((row) => merge(empty(), row) as T);
  out.dependents = rows(out.dependents, emptyDependent, TAX101_MAX_DEPENDENTS);
  out.year_changes = rows(out.year_changes, emptyYearChange, TAX101_MAX_YEAR_CHANGES);
  out.tax_coordination.additional_employers = rows(
    out.tax_coordination.additional_employers,
    emptyEmployer,
    TAX101_MAX_EMPLOYERS,
  );
  return out;
}

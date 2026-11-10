/**
 * Builds the initial Form 101 from what the system already knows about the
 * employee, so the employee only completes what is missing.
 *
 * Every path that received a value is returned in `prefilled`, which the form
 * uses to tell "filled for you" apart from "still missing".
 */
import { digitsOnly, splitPhone } from "./format";
import {
  emptyTax101Form,
  TAX101_MAX_DEPENDENTS,
  type Tax101Dependent,
  type Tax101Employer,
  type Tax101FormData,
  type Tax101IncomeType,
} from "./types";

export interface Tax101EmployeeSource {
  full_name?: string | null;
  id_number?: string | null;
  passport_number?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  country_of_birth?: string | null;
  aliyah_date?: string | null;
  phone?: string | null;
  email?: string | null;
  street?: string | null;
  house_number?: string | null;
  city?: string | null;
  postal_code?: string | null;
  po_box?: string | null;
  marital_status?: string | null;
  is_israeli_resident?: boolean | null;
  health_fund_member?: boolean | null;
  health_fund_name?: string | null;
  kibbutz_member?: string | null;
  start_date?: string | null;
}

export interface Tax101DependentSource {
  full_name?: string | null;
  id_number?: string | null;
  birth_date?: string | null;
  is_in_custody?: boolean | null;
  receives_allowance?: boolean | null;
}

export interface Tax101Settings {
  employer_name: string;
  employer_address: string;
  employer_phone: string;
  employer_tax_file_number: string;
  default_income_type: Tax101IncomeType;
  /** Employee may change values that were filled from the system. */
  allow_edit_prefilled: boolean;
  /** After signing, copy the employee's corrections back to the employee card. */
  write_back_to_employee: boolean;
}

export const DEFAULT_TAX101_SETTINGS: Tax101Settings = {
  employer_name: "",
  employer_address: "",
  employer_phone: "",
  employer_tax_file_number: "",
  default_income_type: "monthly",
  allow_edit_prefilled: true,
  write_back_to_employee: true,
};

export interface Tax101Context {
  taxYear: number;
  employee: Tax101EmployeeSource;
  dependents: Tax101DependentSource[];
  /** Resolved employer: the employee's sub-employer when set, else the company. */
  employer: Partial<Tax101Employer> | null;
  settings: Partial<Tax101Settings> | null;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isoDate = (v: unknown) => {
  const m = /^\d{4}-\d{2}-\d{2}/.exec(str(v));
  return m ? m[0] : "";
};

/** Israeli ID numbers are 9 digits; shorter stored values lost their leading zeros. */
export function normalizeIdNumber(v: unknown): string {
  const d = digitsOnly(str(v));
  return d.length >= 5 && d.length <= 9 ? d.padStart(9, "0") : d;
}

/** Age the child reaches during the tax year (the form's age groups are by year). */
export function ageInTaxYear(birthIso: string, taxYear: number): number | null {
  const d = isoDate(birthIso);
  return d ? taxYear - Number(d.slice(0, 4)) : null;
}

type AgeGroup = "born_this_year" | "age_1_to_2" | "age_3" | "age_4_to_5" | "age_6_to_17" | "age_18";

export function ageGroup(age: number): AgeGroup | null {
  if (age === 0) return "born_this_year";
  if (age >= 1 && age <= 2) return "age_1_to_2";
  if (age === 3) return "age_3";
  if (age >= 4 && age <= 5) return "age_4_to_5";
  if (age >= 6 && age <= 17) return "age_6_to_17";
  if (age === 18) return "age_18";
  return null;
}

/** Child counts for credits 7 and 8, from the children listed in section ג. */
export function childCounts(dependents: Tax101Dependent[], taxYear: number) {
  const inCustody: Partial<Record<AgeGroup, number>> = {};
  const notInCustody: Partial<Record<AgeGroup, number>> = {};
  for (const d of dependents) {
    const age = ageInTaxYear(d.birth_date, taxYear);
    if (age === null) continue;
    const g = ageGroup(age);
    if (!g) continue;
    const bucket = d.is_in_custody ? inCustody : notInCustody;
    bucket[g] = (bucket[g] ?? 0) + 1;
  }
  return { inCustody, notInCustody };
}

/** Writes child counts into the credit 7/8 fields (keeps the checkboxes themselves untouched). */
export function applyChildCounts(data: Tax101FormData, taxYear: number): Tax101FormData {
  const { inCustody, notInCustody } = childCounts(data.dependents, taxYear);
  const n = (v: number | undefined): number | "" => (v ? v : "");
  return {
    ...data,
    tax_credits: {
      ...data.tax_credits,
      children_in_custody_born_this_year: n(inCustody.born_this_year),
      children_in_custody_age_1_to_2: n(inCustody.age_1_to_2),
      children_in_custody_age_3: n(inCustody.age_3),
      children_in_custody_age_4_to_5: n(inCustody.age_4_to_5),
      children_in_custody_age_6_to_17: n(inCustody.age_6_to_17),
      children_in_custody_age_18: n(inCustody.age_18),
      children_not_in_custody_born_this_year: n(notInCustody.born_this_year),
      children_not_in_custody_age_1_to_2: n(notInCustody.age_1_to_2),
      children_not_in_custody_age_3: n(notInCustody.age_3),
      children_not_in_custody_age_4_to_5: n(notInCustody.age_4_to_5),
      children_not_in_custody_age_6_to_17: n(notInCustody.age_6_to_17),
    },
  };
}

const GENDERS = ["male", "female"] as const;
const MARITAL = ["single", "married", "divorced", "widowed", "separated"] as const;
const KIBBUTZ = ["no", "yes_transferred", "yes_not_transferred"] as const;
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | "" =>
  (allowed as readonly string[]).includes(str(v)) ? (str(v) as T) : "";

export function buildTax101Prefill(ctx: Tax101Context): { data: Tax101FormData; prefilled: Set<string> } {
  const e = ctx.employee ?? {};
  const settings = { ...DEFAULT_TAX101_SETTINGS, ...(ctx.settings ?? {}) };
  const data = emptyTax101Form();
  const prefilled = new Set<string>();

  const set = <K extends keyof Tax101FormData>(key: K, value: Tax101FormData[K]) => {
    data[key] = value;
    if (value !== "" && value !== null && value !== undefined) prefilled.add(key);
  };

  // א. Employer — sub-employer/company record first, payroll settings fill the gaps.
  const emp = ctx.employer ?? {};
  data.employer = {
    name: str(emp.name) || settings.employer_name,
    address: str(emp.address) || settings.employer_address,
    phone: str(emp.phone) || settings.employer_phone,
    tax_file_number: digitsOnly(str(emp.tax_file_number) || settings.employer_tax_file_number),
  };
  for (const k of Object.keys(data.employer) as (keyof Tax101Employer)[]) {
    if (data.employer[k]) prefilled.add(`employer.${k}`);
  }

  // ב. Employee
  const [first = "", ...rest] = str(e.full_name).split(/\s+/);
  set("first_name", first);
  set("last_name", rest.join(" "));
  set("id_number", normalizeIdNumber(e.id_number));
  set("passport_number", str(e.passport_number));
  set("gender", pick(e.gender, GENDERS));
  set("birth_date", isoDate(e.birth_date));
  set("country_of_birth", str(e.country_of_birth));
  set("aliyah_date", isoDate(e.aliyah_date));
  set("email", str(e.email));
  const phone = splitPhone(e.phone);
  if (/^05/.test(phone.prefix)) set("mobile_phone", str(e.phone));
  else set("phone", str(e.phone));
  set("street", str(e.street));
  set("house_number", str(e.house_number));
  set("city", str(e.city));
  set("postal_code", digitsOnly(str(e.postal_code)));
  set("po_box", str(e.po_box));
  set("marital_status", pick(e.marital_status, MARITAL));
  set("health_fund_name", str(e.health_fund_name));
  set("kibbutz_member", pick(e.kibbutz_member, KIBBUTZ));
  if (typeof e.is_israeli_resident === "boolean") {
    set("is_israeli_resident", e.is_israeli_resident);
    data.tax_credits.israeli_resident = e.is_israeli_resident;
  }
  if (typeof e.health_fund_member === "boolean") set("health_fund_member", e.health_fund_member);

  // ג. Children under 19 during the tax year
  const children = (ctx.dependents ?? [])
    .map<Tax101Dependent>((d) => ({
      full_name: str(d.full_name),
      id_number: normalizeIdNumber(d.id_number),
      birth_date: isoDate(d.birth_date),
      is_in_custody: d.is_in_custody ?? true,
      receives_allowance: d.receives_allowance ?? false,
    }))
    .filter((d) => {
      const age = ageInTaxYear(d.birth_date, ctx.taxYear);
      return d.full_name && (age === null || (age >= 0 && age <= 18));
    })
    .sort((a, b) => (a.birth_date || "9999").localeCompare(b.birth_date || "9999"))
    .slice(0, TAX101_MAX_DEPENDENTS);
  data.dependents = children;
  children.forEach((d, i) => {
    for (const k of ["full_name", "id_number", "birth_date", "is_in_custody", "receives_allowance"] as const) {
      if (d[k] !== "") prefilled.add(`dependents.${i}.${k}`);
    }
  });

  // ד. Income from this employer
  set("income_type", settings.default_income_type);
  const start = isoDate(e.start_date);
  const yearStart = `${ctx.taxYear}-01-01`;
  if (start) set("job_start_date", start > yearStart ? start : yearStart);

  return { data: applyChildCounts(data, ctx.taxYear), prefilled };
}

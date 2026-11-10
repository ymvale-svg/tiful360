import { describe, expect, it } from "vitest";
import { ageGroup, buildTax101Prefill, childCounts, normalizeIdNumber } from "@/lib/tax101/prefill";
import { getPath, setPath } from "@/lib/tax101/paths";
import { splitPhone } from "@/lib/tax101/format";
import { emptyDependent, emptyTax101Form, mergeTax101Form } from "@/lib/tax101/types";
import { validateTax101 } from "@/lib/validateTax101";
import { TAX101_FIELDS } from "@/lib/tax101/layout";

const ctx = {
  taxYear: 2026,
  employee: {
    full_name: "ישראל בן ישראלי",
    id_number: "23456782",
    gender: "male",
    birth_date: "1985-04-12",
    phone: "050-1234567",
    street: "הרצל",
    city: "רמת גן",
    marital_status: "married",
    is_israeli_resident: true,
    start_date: "2026-03-15",
  },
  dependents: [
    { full_name: "נועה", birth_date: "2015-06-01", is_in_custody: true },
    { full_name: "תינוק", birth_date: "2026-01-10", is_in_custody: true },
    { full_name: "בוגר", birth_date: "2000-01-01", is_in_custody: true },
    { full_name: "רחוק", birth_date: "2023-05-05", is_in_custody: false },
  ],
  employer: { name: "", address: "", phone: "", tax_file_number: "" },
  settings: { employer_name: "חברה", employer_tax_file_number: "912345678", default_income_type: "partial" as const },
};

describe("Form 101 prefill", () => {
  it("fills the employee, employer and children it knows", () => {
    const { data, prefilled } = buildTax101Prefill(ctx);
    expect(data.first_name).toBe("ישראל");
    expect(data.last_name).toBe("בן ישראלי");
    expect(data.id_number).toBe("023456782");
    expect(data.mobile_phone).toBe("050-1234567");
    expect(data.phone).toBe("");
    expect(data.employer).toMatchObject({ name: "חברה", tax_file_number: "912345678" });
    expect(data.income_type).toBe("partial");
    expect(data.job_start_date).toBe("2026-03-15");
    // Children over 18 in the tax year are not listed in section ג
    expect(data.dependents.map((d) => d.full_name)).toEqual(["נועה", "רחוק", "תינוק"]);
    expect(data.tax_credits.children_in_custody_born_this_year).toBe(1);
    expect(data.tax_credits.children_in_custody_age_6_to_17).toBe(1);
    expect(data.tax_credits.children_not_in_custody_age_3).toBe(1);
    // The credit itself stays the employee's decision
    expect(data.tax_credits.children_in_custody).toBe(false);
    expect(prefilled.has("first_name")).toBe(true);
    expect(prefilled.has("postal_code")).toBe(false);
    expect(prefilled.has("dependents.0.full_name")).toBe(true);
  });

  it("uses the sub-employer before the payroll settings", () => {
    const { data } = buildTax101Prefill({ ...ctx, employer: { name: "מעסיק משנה", tax_file_number: "934567890" } });
    expect(data.employer.name).toBe("מעסיק משנה");
    expect(data.employer.tax_file_number).toBe("934567890");
  });

  it("starts the job date at the tax year for long-time employees", () => {
    const { data } = buildTax101Prefill({ ...ctx, employee: { ...ctx.employee, start_date: "2019-02-01" } });
    expect(data.job_start_date).toBe("2026-01-01");
  });

  it("leaves missing fields for the employee and flags them", () => {
    const { data } = buildTax101Prefill(ctx);
    const codes = validateTax101(data).errors.map((e) => e.code);
    expect(codes).toContain("kibbutz");
    expect(codes).toContain("spouse_first");
    expect(codes).not.toContain("first_name");
  });
});

describe("Form 101 helpers", () => {
  it("groups ages as the printed form does", () => {
    expect(ageGroup(0)).toBe("born_this_year");
    expect(ageGroup(2)).toBe("age_1_to_2");
    expect(ageGroup(3)).toBe("age_3");
    expect(ageGroup(5)).toBe("age_4_to_5");
    expect(ageGroup(17)).toBe("age_6_to_17");
    expect(ageGroup(18)).toBe("age_18");
    expect(ageGroup(19)).toBeNull();
    const counts = childCounts([{ ...emptyDependent(), birth_date: "2024-01-01" }], 2026);
    expect(counts.inCustody.age_1_to_2).toBe(1);
  });

  it("normalizes ID numbers and phones", () => {
    expect(normalizeIdNumber("12345")).toBe("000012345");
    expect(normalizeIdNumber("abc")).toBe("");
    expect(splitPhone("+972-50-1234567")).toEqual({ prefix: "050", rest: "1234567" });
    expect(splitPhone("03-7654321")).toEqual({ prefix: "03", rest: "7654321" });
  });

  it("creates table rows when typing into an empty printed row", () => {
    const form = emptyTax101Form();
    const next = setPath(form, "dependents.2.full_name", "דנה", () => emptyDependent());
    expect(next.dependents).toHaveLength(3);
    expect(getPath(next, "dependents.2.full_name")).toBe("דנה");
    expect(form.dependents).toHaveLength(0);
  });

  it("ignores unknown keys and bad shapes in stored drafts", () => {
    const merged = mergeTax101Form(emptyTax101Form(), {
      first_name: "דנה",
      evil: "x",
      tax_credits: { single_parent: "yes" },
      dependents: [{ full_name: "א", extra: 1 }],
    });
    expect(merged.first_name).toBe("דנה");
    expect("evil" in merged).toBe(false);
    expect(merged.tax_credits.single_parent).toBe(false);
    expect(merged.dependents[0]).toEqual({ ...emptyDependent(), full_name: "א" });
  });

  it("maps every validation path to a field on the form", () => {
    const { data } = buildTax101Prefill(ctx);
    data.has_other_income = true;
    data.tax_credits = { ...data.tax_credits, settlement_eligible: true, children_in_custody: true, children_in_custody_born_this_year: "", children_in_custody_age_6_to_17: "", reservist_combat: true, discharged_soldier: true };
    data.tax_coordination.has_additional_employers = true;
    data.year_changes = [{ change_date: "", details: "x", notification_date: "" }];
    const paths = new Set(TAX101_FIELDS.filter((f) => !f.mirror).map((f) => f.path));
    for (const issue of [...validateTax101(data).errors, ...validateTax101(data).warnings]) {
      expect(paths.has(issue.path), issue.code).toBe(true);
    }
  });
});

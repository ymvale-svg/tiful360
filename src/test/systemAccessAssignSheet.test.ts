import { describe, expect, it } from "vitest";
import {
  COL_CODE, COL_FROM, COL_ID, COL_NAME, COL_USERNAME,
  buildSheet, isMarked, parseSheet, parseSheetDate, sheetColumns,
} from "@/domain/systemAccess/assignSheet";

const systems = [
  { id: "s1", name: "פריוריטי", is_active: true },
  { id: "s2", name: "כונן P", is_active: true },
  { id: "s3", name: "ישנה", is_active: false },
];
const catalog = {
  groups: [{ id: "g1", system_id: "s2", name: "הנדסה" }],
  resources: [{ id: "r1", system_id: "s1", name: "ייצור" }, { id: "r2", system_id: "s2", name: "תיקייה" }],
};
const employees = [
  { id: "e1", full_name: "דנה לוי", employee_code: "101", department: "כספים", start_date: "2026-01-04", status: "active" },
  { id: "e2", full_name: "יוסי כהן", employee_code: "102", status: "active" },
  { id: "e3", full_name: "יוסי כהן", employee_code: "103", status: "active" },
  { id: "e4", full_name: "עזב", employee_code: "104", status: "inactive" },
];

describe("access assignment sheet", () => {
  const columns = sheetColumns(systems, catalog);

  it("builds columns like the picker: groups when a system has them, otherwise resources", () => {
    expect(columns.map((c) => c.header)).toEqual(["פריוריטי", "פריוריטי · ייצור", "כונן P", "כונן P · הנדסה"]);
  });

  it("lists current employees with held access pre-marked and the internal id last", () => {
    const aoa = buildSheet(employees, columns, [{ employee_id: "e1", system_id: "s2", group_id: "g1", resource_id: null }]);
    expect(aoa).toHaveLength(4);
    expect(aoa[0].at(-1)).toBe(COL_ID);
    const dana = aoa[1];
    expect(dana[0]).toBe("דנה לוי");
    expect(dana[aoa[0].indexOf("כונן P · הנדסה")]).toBe("V");
    expect(dana[aoa[0].indexOf("כונן P")]).toBe("");
  });

  it("reads marks back into direct-assignment rows, by id, code or unique name", () => {
    const parsed = parseSheet([
      { [COL_NAME]: "דנה לוי", [COL_ID]: "e1", "פריוריטי · ייצור": "V", "כונן P": "x", [COL_USERNAME]: "dana" },
      { [COL_NAME]: "x", [COL_CODE]: "102", "פריוריטי": "כן", [COL_FROM]: "15/03/2025" },
      { [COL_NAME]: "בלי סימון", "פריוריטי": "" },
      { "שם": "?", "עמודה זרה": "V" },
    ], columns, employees);
    expect(parsed.rows).toEqual([
      { employee_id: "e1", system_id: "s1", group_id: null, resource_id: "r1", effective_date: null, external_username: "dana" },
      { employee_id: "e1", system_id: "s2", group_id: null, resource_id: null, effective_date: null, external_username: "dana" },
      { employee_id: "e2", system_id: "s1", group_id: null, resource_id: null, effective_date: "2025-03-15", external_username: null },
    ]);
    expect(parsed.employees).toBe(2);
    expect(parsed.unknownColumns).toEqual(["שם", "עמודה זרה"]);
    expect(parsed.errors).toEqual([]);
  });

  it("reports ambiguous names, unknown employees and bad dates instead of guessing", () => {
    const parsed = parseSheet([
      { [COL_NAME]: "יוסי כהן", "פריוריטי": "V" },
      { [COL_NAME]: "לא קיים", "פריוריטי": "V" },
      { [COL_ID]: "e1", "פריוריטי": "V", [COL_FROM]: "מחר" },
    ], columns, employees);
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toHaveLength(3);
    expect(parsed.errors[0]).toContain("שורה 2");
  });

  it("understands common marks and date forms", () => {
    expect(["V", "x", "1", "כן", " ✓ "].every(isMarked)).toBe(true);
    expect(["", "לא", "0", null].some(isMarked)).toBe(false);
    expect(parseSheetDate("2025-3-5")).toBe("2025-03-05");
    expect(parseSheetDate("5.3.2025")).toBe("2025-03-05");
    expect(parseSheetDate(46031, () => ({ y: 2026, m: 1, d: 9 }))).toBe("2026-01-09");
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate("abc")).toBeUndefined();
  });
});

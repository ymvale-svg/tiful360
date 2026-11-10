import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_CONTACT_HEADERS,
  buildEmployeeContactRows,
} from "@/lib/employeeContactExport";

describe("employee contact export", () => {
  const employees = [
    { id: "1", full_name: "רחל סרדס", department: "מנהלה" },
    { id: "2", full_name: "משה לוי", department: "תפעול" },
    { id: "3", full_name: "דנה כהן", department: null },
  ];
  const contacts = new Map([
    ["1", { phone: "050-1234567", email: "rachel@x.co.il" }],
    ["2", { phone: null, email: "moshe@x.co.il" }],
  ]);

  it("exports exactly name, department, phone and email", () => {
    expect(EMPLOYEE_CONTACT_HEADERS.map((h) => h.label)).toEqual([
      "שם מלא",
      "מחלקה",
      "טלפון",
      "מייל",
    ]);
  });

  it("keeps every employee and fills phone/email from the full rows", () => {
    const rows = buildEmployeeContactRows(employees, contacts);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      full_name: "רחל סרדס",
      department: "מנהלה",
      phone: "050-1234567",
      email: "rachel@x.co.il",
    });
    expect(rows[1].phone).toBe("");
    expect(rows[1].email).toBe("moshe@x.co.il");
  });

  it("leaves missing values empty instead of null or undefined", () => {
    const rows = buildEmployeeContactRows(employees, contacts);
    expect(rows[2]).toEqual({
      full_name: "דנה כהן",
      department: "",
      phone: "",
      email: "",
    });
    expect(rows.every((r) => Object.values(r).every((v) => typeof v === "string"))).toBe(true);
  });
});

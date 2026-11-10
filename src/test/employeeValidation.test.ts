import { describe, expect, it } from "vitest";
import { isValidIsraeliId, isValidPhone, validateEmployeeFields } from "@/lib/employeeValidation";

const valid = {
  full_name: "ישראל ישראלי",
  employee_code: "EMP-001",
  id_number: "123456782",
  email: "israel@company.co.il",
  phone: "050-1234567",
  role: "מהנדס",
  department: "הנדסה",
  start_date: "2026-01-01",
};

describe("employee field validation", () => {
  it("accepts a complete, valid employee", () => {
    expect(validateEmployeeFields(valid)).toEqual({});
  });

  it("checks the Israeli ID check digit", () => {
    expect(isValidIsraeliId("123456782")).toBe(true);
    expect(isValidIsraeliId("123456789")).toBe(false);
    expect(validateEmployeeFields({ ...valid, id_number: "123456789" }).id_number).toBe("תעודת זהות לא תקינה");
  });

  it("flags required fields that were cleared", () => {
    const e = validateEmployeeFields({ ...valid, full_name: " ", role: "", department: "", start_date: "", employee_code: "" });
    expect(Object.keys(e).sort()).toEqual(["department", "employee_code", "full_name", "role", "start_date"]);
  });

  it("treats email and phone as optional but checks them when present", () => {
    expect(validateEmployeeFields({ ...valid, email: "", phone: "" })).toEqual({});
    expect(validateEmployeeFields({ ...valid, email: "not-an-email" }).email).toBeDefined();
    expect(isValidPhone("abc")).toBe(false);
    expect(validateEmployeeFields({ ...valid, phone: "12" }).phone).toBe("פורמט טלפון לא תקין");
  });
});

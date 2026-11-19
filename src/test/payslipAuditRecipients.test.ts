import { describe, it, expect } from "vitest";
import { payslipAuditRecipientIds } from "../../supabase/functions/_shared/payslipAuditRecipients";

describe("payslipAuditRecipientIds", () => {
  const roles = [
    { user_id: "super-1", role: "super_admin" },
    { user_id: "admin-a", role: "admin" },
    { user_id: "admin-b", role: "admin" },
    { user_id: "hr-a", role: "hr" },
  ];

  it("notifies super admins and only the admins of the employee's company", () => {
    expect(payslipAuditRecipientIds(roles, ["admin-a", "hr-a"], "viewer")).toEqual(["super-1", "admin-a"]);
  });

  it("does not notify admins of other companies", () => {
    expect(payslipAuditRecipientIds(roles, [], "viewer")).toEqual(["super-1"]);
  });

  it("skips the viewer and removes duplicates", () => {
    const dup = [...roles, { user_id: "admin-a", role: "super_admin" }];
    expect(payslipAuditRecipientIds(dup, ["admin-a"], "super-1")).toEqual(["admin-a"]);
  });
});

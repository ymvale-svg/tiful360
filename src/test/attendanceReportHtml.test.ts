import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { attendanceReportMeta, escapeHtml } from "@/lib/attendanceReportHtml";

describe("monthly attendance report export: employee details are escaped", () => {
  it("escapes markup in the name, employee code and department", () => {
    const html = attendanceReportMeta({
      full_name: '<img src=x onerror="alert(1)">',
      employee_code: "<script>x</script>",
      department: "R&D 'ops'",
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("R&amp;D &#39;ops&#39;");
  });

  it("shows a dash for missing code and department", () => {
    expect(attendanceReportMeta({ full_name: "דנה", employee_code: null, department: "" }))
      .toBe("<b>דנה</b> · מספר עובד: — · מחלקה: —");
    expect(escapeHtml(null)).toBe("");
  });

  it("the PDF export uses the escaped helper, not raw employee fields", () => {
    const src = readFileSync("src/components/payroll/MonthlyAttendanceReview.tsx", "utf8");
    expect(src).toContain("attendanceReportMeta(e)");
    expect(src).not.toMatch(/<b>\$\{e\.full_name\}<\/b>/);
  });
});

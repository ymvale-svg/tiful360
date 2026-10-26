import { describe, it, expect } from "vitest";
import { monthWorkingDays, leaveLabelForDay } from "@/lib/attendanceMonth";

describe("monthWorkingDays", () => {
  // אוקטובר 2026: 01/10 חמישי, 02/10 שישי, 03/10 שבת, 04/10 ראשון
  const today = new Date(2026, 9, 26); // 26/10/2026

  it("כולל רק ימים א׳–ה׳ ולא סופי שבוע", () => {
    const days = monthWorkingDays(2026, 10, new Set(), today);
    expect(days).toContain("2026-10-01"); // חמישי
    expect(days).toContain("2026-10-04"); // ראשון
    expect(days).not.toContain("2026-10-02"); // שישי
    expect(days).not.toContain("2026-10-03"); // שבת
  });

  it("מדלג על חגי חברה", () => {
    const days = monthWorkingDays(2026, 10, new Set(["2026-10-05"]), today);
    expect(days).not.toContain("2026-10-05");
    expect(days).toContain("2026-10-06");
  });

  it("לא מציג ימים עתידיים בחודש הנוכחי", () => {
    const days = monthWorkingDays(2026, 10, new Set(), today);
    expect(days[days.length - 1]).toBe("2026-10-26");
    expect(days).not.toContain("2026-10-27");
  });

  it("מחזיר את כל ימי העבודה בחודש שעבר", () => {
    const days = monthWorkingDays(2026, 9, new Set(), today);
    expect(days).toContain("2026-09-30"); // רביעי
  });
});

describe("leaveLabelForDay", () => {
  const leaves = [
    { start_date: "2026-10-22", end_date: "2026-10-24", request_type: "vacation" },
    { start_date: "2026-10-10", end_date: null, request_type: "sick" },
  ];

  it("מחזיר את סיבת ההיעדרות ביום שבטווח", () => {
    expect(leaveLabelForDay(leaves, "2026-10-22")).toBe("חופשה");
    expect(leaveLabelForDay(leaves, "2026-10-23")).toBe("חופשה");
  });

  it("מחזיר null מחוץ לטווח", () => {
    expect(leaveLabelForDay(leaves, "2026-10-09")).toBeNull();
  });

  it("היעדרות ללא תאריך סיום מכסה מיום ההתחלה ואילך", () => {
    expect(leaveLabelForDay(leaves, "2026-10-15")).toBe("מחלה");
  });
});

import { buildReviewDays, isGapDay } from "@/lib/attendanceMonth";
describe("buildReviewDays", () => {
  const p = (id: string, at: string, direction: string) => ({ id, employee_id: "e", punch_at: at, direction });
  it("מסמן חוסר, החתמה חסרה, היעדרות ויום תקין", () => {
    const rows = buildReviewDays(
      ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-25"],
      [p("1", new Date(2026, 9, 20, 8).toISOString(), "in"), p("2", new Date(2026, 9, 20, 17).toISOString(), "out"),
       p("3", new Date(2026, 9, 21, 8).toISOString(), "in")],
      [{ start_date: "2026-10-22", end_date: "2026-10-22", request_type: "vacation" }],
    );
    expect(rows.map((r) => r.status)).toEqual(["ok", "partial", "leave", "missing"]);
    expect(rows.filter(isGapDay).length).toBe(2);
    expect(rows[2].leave).toBe("חופשה");
  });
});

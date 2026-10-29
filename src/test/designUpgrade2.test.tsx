import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Package, Users, Tag } from "lucide-react";
import { dateOnly, dayEnds, percentChange, rebuildSeries } from "@/lib/kpiTrends";
import { buildAttendanceWeeks, heatLevel, summarize } from "@/lib/attendanceHeat";
import { dayLabel, groupByDay } from "@/lib/timelineDays";
import { ActiveFilters } from "@/components/ui/active-filters";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { EmptyState } from "@/components/feedback/StateView";
import { Stepper } from "@/components/ui/stepper";

describe("kpiTrends", () => {
  const ends = [new Date(2026, 9, 1, 23, 59), new Date(2026, 9, 2, 23, 59), new Date(2026, 9, 3, 12)];

  it("removes rows added later and restores rows closed later", () => {
    const rows = [
      { from: new Date(2026, 9, 2, 10), until: null, countedNow: true }, // opened on day 2, still open
      { from: new Date(2026, 8, 1), until: new Date(2026, 9, 3, 9), countedNow: false }, // closed on day 3
      { from: new Date(2026, 9, 2, 8), until: new Date(2026, 9, 2, 9), countedNow: false }, // opened and closed inside
    ];
    expect(rebuildSeries(5, rows, ends)).toEqual([5, 6, 5]);
  });

  it("ends with today's value and never goes negative", () => {
    expect(rebuildSeries(0, [{ from: new Date(2026, 9, 3, 1), until: null, countedNow: true }], ends)).toEqual([0, 0, 0]);
  });

  it("builds day ends with now last", () => {
    const now = new Date(2026, 9, 29, 15);
    const e = dayEnds(3, now);
    expect(e[2]).toBe(now);
    expect(e[0].getDate()).toBe(27);
    expect(e[0].getHours()).toBe(23);
  });

  it("computes percent change only from a non-zero start", () => {
    expect(percentChange([10, 12, 15])).toBe(50);
    expect(percentChange([0, 4])).toBeUndefined();
  });

  it("reads date-only values as local days", () => {
    expect(dateOnly("2026-10-05")?.getDate()).toBe(5);
    expect(dateOnly(null)).toBeNull();
  });
});

describe("attendanceHeat", () => {
  const today = new Date(2026, 9, 29, 18); // Thursday
  it("lays out weeks Sunday-first ending this week, with hours, leave and future days", () => {
    const punches = [new Date(2026, 9, 27, 8).toISOString(), new Date(2026, 9, 27, 17).toISOString(), new Date(2026, 9, 26, 9).toISOString()];
    const weeks = buildAttendanceWeeks(punches, [{ start_date: "2026-10-28", end_date: "2026-10-28", status: "approved" }], 2, today);
    expect(weeks).toHaveLength(2);
    const week = weeks[1];
    expect(week[0].date).toBe("2026-10-25");
    expect(week[2]).toMatchObject({ date: "2026-10-27", kind: "worked", punches: 2, level: 3 });
    expect(week[1]).toMatchObject({ kind: "worked", punches: 1, level: 1 });
    expect(week[3].kind).toBe("leave");
    expect(week[5].kind).toBe("future");
    expect(summarize(weeks)).toMatchObject({ workedDays: 2, leaveDays: 1, avgHours: 9 });
  });

  it("ignores rejected leave", () => {
    const weeks = buildAttendanceWeeks([], [{ start_date: "2026-10-28", end_date: null, status: "rejected" }], 1, today);
    expect(weeks[0][3].kind).toBe("none");
  });

  it("maps hours to levels", () => {
    expect([heatLevel(0, 0), heatLevel(2, 2), heatLevel(6, 2), heatLevel(9, 2), heatLevel(11, 2)]).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("activity timeline helpers", () => {
  it("labels today and yesterday", () => {
    const now = new Date(2026, 9, 29, 10);
    expect(dayLabel("2026-10-29", now)).toBe("היום");
    expect(dayLabel("2026-10-28", now)).toBe("אתמול");
  });

  it("groups consecutive items by day", () => {
    const g = groupByDay([{ at: "2026-10-29" }, { at: "2026-10-29" }, { at: "2026-10-27" }]);
    expect(g.map((x) => [x.key, x.items.length])).toEqual([["2026-10-29", 2], ["2026-10-27", 1]]);
  });
});

describe("ActiveFilters", () => {
  it("removes one filter and clears all", () => {
    const removeA = vi.fn();
    const clear = vi.fn();
    render(
      <ActiveFilters
        onClearAll={clear}
        filters={[
          { id: "a", label: "סטטוס", value: "פעיל", onRemove: removeA },
          { id: "b", label: "חיפוש", value: "דנה", onRemove: vi.fn() },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "הסרת הסינון סטטוס: פעיל" }));
    expect(removeA).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "נקה הכל" }));
    expect(clear).toHaveBeenCalled();
  });

  it("renders nothing with no filters and no summary", () => {
    const { container } = render(<ActiveFilters filters={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("BulkActionBar", () => {
  it("shows the count while rows are selected and clears on Escape", () => {
    const clear = vi.fn();
    render(<BulkActionBar count={3} onClear={clear}><button type="button">מסירה</button></BulkActionBar>);
    expect(screen.getByRole("toolbar", { name: "פעולות על 3 פריטים שנבחרו" })).toBeTruthy();
    act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("is hidden with nothing selected", () => {
    render(<BulkActionBar count={0} onClear={vi.fn()}><span /></BulkActionBar>);
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
});

describe("EmptyState icons", () => {
  it("fans three icons and keeps the title", () => {
    const { container } = render(<EmptyState title="אין פריטים" icons={[Tag, Package, Users]} />);
    expect(container.querySelectorAll("svg")).toHaveLength(3);
    expect(screen.getByText("אין פריטים")).toBeTruthy();
  });
});

describe("Stepper", () => {
  it("marks the current step and lets finished steps be revisited", () => {
    const onStepClick = vi.fn();
    render(<Stepper steps={[{ label: "פרטים" }, { label: "מסמכים" }, { label: "סיום" }]} current={1} onStepClick={onStepClick} />);
    const current = document.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain("מסמכים");
    fireEvent.click(screen.getByRole("button", { name: "חזרה לשלב 1: פרטים" }));
    expect(onStepClick).toHaveBeenCalledWith(0);
    expect(screen.queryByRole("button", { name: /סיום/ })).toBeNull();
  });
});

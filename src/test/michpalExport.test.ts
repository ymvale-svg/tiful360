import { describe, it, expect, vi } from "vitest";
import {
  buildMichpalCsv,
  downloadMichpalCsv,
  MICHPAL_HEADER,
  encodeWindows1255,
  punchesToMichpalRows,
  leavesToMichpalRows,
  DEFAULT_ABSENCE_CODES,
  DEFAULT_INCLUDE_ABSENCES,
  matchesSource,
  toMichpalDate,
} from "@/lib/michpalExport";

describe("michpal export", () => {
  it("exports csv by default and dat only when requested", () => {
    vi.useFakeTimers();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:michpal"), revokeObjectURL: vi.fn() });
    const names: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      names.push(this.download);
    });
    try {
      downloadMichpalCsv("data", "michpal-2026-10-remote.csv");
      downloadMichpalCsv("data", "michpal-2026-10-clock.dat", "dat");
      downloadMichpalCsv("data", "michpal-2026-10-combined", "dat");
      expect(names).toEqual([
        "michpal-2026-10-remote.csv",
        "michpal-2026-10-clock.dat",
        "michpal-2026-10-combined.dat",
      ]);
    } finally {
      vi.runAllTimers();
      vi.useRealTimers();
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("formats dates and builds sorted CSV", () => {
    const csv = buildMichpalCsv([
      { date: "2014-05-01", time: "17:00:00", action: "1", cardId: "626" },
      { date: "2014-05-01", time: "08:30:00", action: "0", cardId: "626" },
      { date: "2014-05-16", time: "08:00:00", action: "H", cardId: "626", absenceCode: "4", absenceEnd: "08:40:00" },
    ]);
    expect(csv.split("\r\n")).toEqual([
      MICHPAL_HEADER,
      "01/05/2014,08:30:00,0,626,,",
      "01/05/2014,17:00:00,1,626,,",
      "16/05/2014,08:00:00,H,626,4,08:40:00",
      "",
    ]);
  });

  it("converts iso date to dd/mm/yyyy", () => {
    expect(toMichpalDate("2026-01-09")).toBe("09/01/2026");
  });

  it("encodes hebrew to windows-1255", () => {
    const bytes = encodeWindows1255("אב,1");
    expect(Array.from(bytes)).toEqual([0xe0, 0xe1, 0x2c, 0x31]);
  });

  it("filters by source", () => {
    expect(matchesSource("clock", "clock")).toBe(true);
    expect(matchesSource("clock", "remote")).toBe(false);
    expect(matchesSource("portal_remote", "remote")).toBe(true);
    expect(matchesSource("portal_remote", "combined")).toBe(true);
  });

  it("maps punches and reports skipped rows", () => {
    const codes = new Map([["e1", "626"]]);
    const res = punchesToMichpalRows(
      [
        { employee_id: "e1", punch_at: "2026-05-01T05:30:00Z", direction: "in", source: "clock", status: "approved" },
        { employee_id: "e1", punch_at: "2026-05-01T06:00:00Z", direction: "unknown", source: "clock", status: "approved" },
        { employee_id: "e2", punch_at: "2026-05-01T06:00:00Z", direction: "in", source: "clock", status: "approved" },
        { employee_id: "e1", punch_at: "2026-05-01T07:00:00Z", direction: "in", source: "clock", status: "rejected" },
      ],
      codes,
      "clock",
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ date: "2026-05-01", action: "0", cardId: "626" });
    expect(res.skippedUnknownDirection).toBe(1);
    expect(res.skippedNoCode).toBe(1);
  });

  it("strips the EMP- prefix from employee codes", () => {
    const codes = new Map([["e1", "EMP-309"], ["e2", "emp-5"], ["e3", "626"]]);
    const res = punchesToMichpalRows(
      [
        { employee_id: "e1", punch_at: "2026-05-01T05:30:00Z", direction: "in", source: "clock", status: "approved" },
        { employee_id: "e2", punch_at: "2026-05-01T05:30:00Z", direction: "in", source: "clock", status: "approved" },
        { employee_id: "e3", punch_at: "2026-05-01T05:30:00Z", direction: "in", source: "clock", status: "approved" },
      ],
      codes,
      "combined",
    );
    expect(res.rows.map((r) => r.cardId)).toEqual(["309", "5", "626"]);
  });

  it("expands approved leave into daily A rows clipped to range", () => {
    const rows = leavesToMichpalRows(
      [{ employee_id: "e1", request_type: "vacation", start_date: "2026-04-28", end_date: "2026-05-02" }],
      new Map([["e1", "626"]]),
      DEFAULT_ABSENCE_CODES,
      "2026-05-01",
      "2026-05-31",
    );
    expect(rows.map((r) => r.date)).toEqual(["2026-05-01", "2026-05-02"]);
    expect(rows[0]).toMatchObject({ action: "A", time: "00:00:00", absenceCode: "חפש" });
  });
});

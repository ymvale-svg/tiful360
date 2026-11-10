import { describe, it, expect } from "vitest";
import {
  buildShiftRows,
  placeLabel,
  punchIdsMissingAddress,
  toExportRows,
  NOTE,
  type ReportPunch,
} from "@/lib/attendanceLocationReport";

let seq = 0;
function punch(at: string, direction: string, extra: Partial<ReportPunch> = {}): ReportPunch {
  seq++;
  return {
    punch_id: `p${String(seq).padStart(3, "0")}`,
    employee_id: "e1",
    full_name: "ישראל ישראלי",
    department: "תפעול",
    employee_code: "101",
    punch_at: at,
    direction,
    source: "portal_remote",
    lat: 32.0853,
    lng: 34.7818,
    accuracy: 10,
    geo_address: "דיזנגוף 50, תל אביב",
    ...extra,
  };
}

// Israel is UTC+2 in November (winter time).
const NOW = new Date("2026-11-20T12:00:00Z");

describe("buildShiftRows", () => {
  it("pairs a check-in with the following check-out on the same day", () => {
    const rows = buildShiftRows(
      [punch("2026-11-01T06:00:00Z", "in"), punch("2026-11-01T15:30:00Z", "out", { geo_address: "הרצל 1, חולון" })],
      "2026-11-01", "2026-11-30", NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].day).toBe("2026-11-01");
    expect(rows[0].in?.time).toBe("08:00");
    expect(rows[0].in?.place).toBe("דיזנגוף 50, תל אביב");
    expect(rows[0].out?.time).toBe("17:30");
    expect(rows[0].out?.place).toBe("הרצל 1, חולון");
    expect(rows[0].minutes).toBe(570);
    expect(rows[0].note).toBe("");
  });

  it("keeps several shifts on the same day as separate rows", () => {
    const rows = buildShiftRows(
      [
        punch("2026-11-02T06:00:00Z", "in"),
        punch("2026-11-02T10:00:00Z", "out"),
        punch("2026-11-02T11:00:00Z", "in"),
        punch("2026-11-02T15:00:00Z", "out"),
      ],
      "2026-11-01", "2026-11-30", NOW,
    );
    expect(rows.map((r) => [r.in?.time, r.out?.time])).toEqual([["08:00", "12:00"], ["13:00", "17:00"]]);
  });

  it("files a night shift crossing midnight under the check-in day", () => {
    // 22:00 on 3/11 to 06:00 on 4/11, Israel time
    const rows = buildShiftRows(
      [punch("2026-11-03T20:00:00Z", "in"), punch("2026-11-04T04:00:00Z", "out")],
      "2026-11-01", "2026-11-30", NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].day).toBe("2026-11-03");
    expect(rows[0].minutes).toBe(480);
  });

  it("drops a night shift that started before the range and keeps one that ends after it", () => {
    const rows = buildShiftRows(
      [
        punch("2026-10-31T20:00:00Z", "in"), // 31/10 22:00
        punch("2026-11-01T04:00:00Z", "out"), // 1/11 06:00
        punch("2026-11-30T20:00:00Z", "in"), // 30/11 22:00
        punch("2026-12-01T04:00:00Z", "out"), // 1/12 06:00
      ],
      "2026-11-01", "2026-11-30", new Date("2026-12-05T00:00:00Z"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].day).toBe("2026-11-30");
    expect(rows[0].out?.time).toBe("06:00");
  });

  it("marks a check-in without a check-out and a check-out without a check-in", () => {
    const rows = buildShiftRows(
      [punch("2026-11-05T06:00:00Z", "in"), punch("2026-11-06T06:00:00Z", "in"), punch("2026-11-06T15:00:00Z", "out"), punch("2026-11-07T15:00:00Z", "out")],
      "2026-11-01", "2026-11-30", NOW,
    );
    expect(rows.map((r) => [r.day, r.note])).toEqual([
      ["2026-11-05", NOTE.missingOut],
      ["2026-11-06", ""],
      ["2026-11-07", NOTE.missingIn],
    ]);
  });

  it("does not pair punches more than 20 hours apart", () => {
    const rows = buildShiftRows(
      [punch("2026-11-08T06:00:00Z", "in"), punch("2026-11-09T05:00:00Z", "out")],
      "2026-11-01", "2026-11-30", NOW,
    );
    expect(rows.map((r) => r.note)).toEqual([NOTE.missingOut, NOTE.missingIn]);
  });

  it("shows an open check-in from the last hours as still at work", () => {
    const rows = buildShiftRows([punch("2026-11-20T06:00:00Z", "in")], "2026-11-01", "2026-11-30", NOW);
    expect(rows[0].note).toBe(NOTE.atWork);
  });

  it("puts a punch without direction on its own row", () => {
    const rows = buildShiftRows(
      [punch("2026-11-10T06:00:00Z", "in"), punch("2026-11-10T09:00:00Z", "unknown"), punch("2026-11-10T15:00:00Z", "out")],
      "2026-11-01", "2026-11-30", NOW,
    );
    expect(rows.map((r) => r.note)).toEqual(["", NOTE.unknownDirection]);
    expect(rows[0].minutes).toBe(540);
  });

  it("separates employees and sorts by name", () => {
    const rows = buildShiftRows(
      [
        punch("2026-11-01T06:00:00Z", "in", { employee_id: "e2", full_name: "תמר" }),
        punch("2026-11-01T06:00:00Z", "in", { employee_id: "e1", full_name: "אבי" }),
      ],
      "2026-11-01", "2026-11-30", NOW,
    );
    expect(rows.map((r) => r.full_name)).toEqual(["אבי", "תמר"]);
  });
});

describe("placeLabel", () => {
  it("falls back to coordinates, clock and manual labels", () => {
    expect(placeLabel(punch("2026-11-01T06:00:00Z", "in", { geo_address: null }))).toBe("32.08530, 34.78180");
    expect(placeLabel(punch("2026-11-01T06:00:00Z", "in", { geo_address: "" }))).toBe("32.08530, 34.78180");
    expect(placeLabel(punch("2026-11-01T06:00:00Z", "in", { lat: null, lng: null, source: "clock" }))).toBe("שעון נוכחות");
    expect(placeLabel(punch("2026-11-01T06:00:00Z", "in", { lat: null, lng: null, source: "manual_add" }))).toBe("הוזן ידנית");
    expect(placeLabel(punch("2026-11-01T06:00:00Z", "in", { lat: null, lng: null }))).toBe("ללא מיקום");
  });
});

describe("punchIdsMissingAddress / toExportRows", () => {
  it("lists only GPS punches without a resolved address", () => {
    const a = punch("2026-11-01T06:00:00Z", "in", { geo_address: null });
    const b = punch("2026-11-01T07:00:00Z", "in", { geo_address: "" });
    const c = punch("2026-11-01T08:00:00Z", "in", { lat: null, lng: null, geo_address: null, source: "clock" });
    expect(punchIdsMissingAddress([a, b, c])).toEqual([a.punch_id]);
  });

  it("formats an export row", () => {
    const rows = buildShiftRows(
      [punch("2026-11-01T06:00:00Z", "in"), punch("2026-11-01T15:05:00Z", "out")],
      "2026-11-01", "2026-11-30", NOW,
    );
    expect(toExportRows(rows)[0]).toMatchObject({
      date: "01/11/2026",
      weekday: "יום ראשון",
      in_time: "08:00",
      out_time: "17:05",
      duration: "9:05",
    });
  });
});

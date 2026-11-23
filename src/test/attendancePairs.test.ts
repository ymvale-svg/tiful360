import { describe, it, expect } from "vitest";
import { pairDayPunches, groupPunchesByWorkDay, minutesToHours } from "@/lib/attendancePairs";

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const p = (id: string, iso: string, direction: string, status?: string) => ({ id, punch_at: iso, direction, status });

describe("pairDayPunches — כמה כניסות ויציאות ביום", () => {
  it("2 החתמות: זוג אחד, שעות בין הכניסה ליציאה", () => {
    const r = pairDayPunches([p("1", at(18, 9), "in"), p("2", at(18, 17), "out")]);
    expect(r.pairs.length).toBe(1);
    expect(r.workedMinutes).toBe(480);
    expect(r.hasGap).toBe(false);
  });

  it("4 החתמות: שני זוגות, זמן היציאה לא נספר כשעות עבודה", () => {
    const r = pairDayPunches([
      p("1", at(18, 9, 26), "in"), p("2", at(18, 12), "out"),
      p("3", at(18, 14), "in"), p("4", at(18, 22, 35), "out"),
    ]);
    expect(r.pairs.length).toBe(2);
    expect(r.workedMinutes).toBe(154 + 515); // 09:26–12:00 + 14:00–22:35
    expect(r.breakMinutes).toBe(120);
    expect(minutesToHours(r.workedMinutes)).toBe("11.2"); // ולא 13.2 מהכניסה הראשונה ליציאה האחרונה
    expect(r.hasGap).toBe(false);
  });

  it("3 החתמות: חזרה בלי יציאה — מסומן כחסר", () => {
    const r = pairDayPunches([p("1", at(18, 9), "in"), p("2", at(18, 12), "out"), p("3", at(18, 13), "in")]);
    expect(r.pairs.length).toBe(2);
    expect(r.pairs[1]).toEqual({ in: expect.objectContaining({ id: "3" }), out: null });
    expect(r.workedMinutes).toBe(180);
    expect(r.hasGap).toBe(true);
  });

  it("יציאה ושוב יציאה: חסרה החזרה באמצע", () => {
    const r = pairDayPunches([p("1", at(18, 9), "in"), p("2", at(18, 12), "out"), p("3", at(18, 17), "out")]);
    expect(r.pairs.map((x) => [x.in?.id ?? null, x.out?.id ?? null])).toEqual([["1", "2"], [null, "3"]]);
    expect(r.hasGap).toBe(true);
  });

  it("5 החתמות: שני זוגות שלמים וכניסה פתוחה", () => {
    const r = pairDayPunches([
      p("1", at(18, 8), "in"), p("2", at(18, 10), "out"), p("3", at(18, 11), "in"),
      p("4", at(18, 15), "out"), p("5", at(18, 16), "in"),
    ]);
    expect(r.pairs.length).toBe(3);
    expect(r.workedMinutes).toBe(360);
    expect(r.hasGap).toBe(true);
  });

  it("החתמה שנדחתה לא נספרת", () => {
    const r = pairDayPunches([p("1", at(18, 9), "in"), p("x", at(18, 10), "out", "rejected"), p("2", at(18, 17), "out")]);
    expect(r.pairs.length).toBe(1);
    expect(r.workedMinutes).toBe(480);
  });
});

describe("groupPunchesByWorkDay — משמרת לילה", () => {
  it("יציאה אחרי חצות נספרת ליום הכניסה", () => {
    const m = groupPunchesByWorkDay([p("1", at(18, 22), "in"), p("2", at(19, 6), "out"), p("3", at(19, 22), "in")]);
    expect(m.get("2026-11-18")?.map((x) => x.id)).toEqual(["1", "2"]);
    expect(m.get("2026-11-19")?.map((x) => x.id)).toEqual(["3"]);
  });

  it("יציאה ביום הבא אחרי יותר מ-20 שעות נשארת ביום שלה", () => {
    const m = groupPunchesByWorkDay([p("1", at(18, 8), "in"), p("2", at(19, 17), "out")]);
    expect(m.get("2026-11-18")?.map((x) => x.id)).toEqual(["1"]);
    expect(m.get("2026-11-19")?.map((x) => x.id)).toEqual(["2"]);
  });
});

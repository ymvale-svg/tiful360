import { describe, expect, it } from "vitest";
import { launcherOffset } from "@/lib/floatingLayer";
import { todaysPunches } from "@/components/portal/PortalClockCard";

describe("floating widget offsets", () => {
  it("sits in its corner, above the safe area, when no upload runs", () => {
    expect(launcherOffset(0, 390)).toEqual({ left: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" });
  });
  it("stacks above the progress cards on phones", () => {
    const { left, bottom } = launcherOffset(2, 390);
    expect(left).toBe(16);
    expect(bottom).toBe("calc(216px + env(safe-area-inset-bottom, 0px))");
  });
  it("moves beside the progress center on wide screens", () => {
    expect(launcherOffset(1, 1280, 24).left).toBeGreaterThan(16 + 320);
  });
});

describe("portal clock card", () => {
  it("keeps only today's punches, oldest first", () => {
    const now = new Date(2026, 9, 28, 12, 0);
    const p = (h: number, day = 28, direction: "in" | "out" = "in") =>
      ({ id: `${day}-${h}`, punch_at: new Date(2026, 9, day, h).toISOString(), direction }) as never;
    const result = todaysPunches([p(17, 28, "out"), p(8), p(9, 27)], now);
    expect(result.map((x: { id: string }) => x.id)).toEqual(["28-8", "28-17"]);
  });
});

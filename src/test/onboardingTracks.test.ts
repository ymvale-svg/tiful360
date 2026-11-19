import { describe, expect, it } from "vitest";
import { groupByTrack, itemTypeForCategory, resolveTrack, showInOnboarding } from "@/domain/onboarding/tracks";

const cat = (id: string, patch: Record<string, unknown> = {}) => ({ id, domain: "physical", ...patch });

describe("fulfilment tracks", () => {
  it("derives the track from the domain when the category has none", () => {
    expect(resolveTrack(cat("laptop"))).toBe("equipment");
    expect(resolveTrack(cat("priority", { fulfillment_track: "access" }))).toBe("access");
    expect(resolveTrack(cat("office", { domain: "licenses" }))).toBe("license");
    expect(resolveTrack(cat("safety", { domain: "training" }))).toBe("task");
    expect(resolveTrack(cat("policy", { domain: "insurance" }))).toBe("none");
    expect(resolveTrack(cat("lease", { domain: "real_estate" }))).toBe("none");
  });

  it("treats vehicle categories as the vehicle track", () => {
    expect(resolveTrack(cat("car", { protocol_type: "vehicle" }))).toBe("vehicle");
    expect(itemTypeForCategory(cat("car", { protocol_type: "vehicle" }))).toBe("vehicle");
  });

  it("prefers the category's own track and ignores unknown values", () => {
    expect(resolveTrack(cat("payroll", { fulfillment_track: "task" }))).toBe("task");
    expect(resolveTrack(cat("laptop", { fulfillment_track: "bogus" }))).toBe("equipment");
  });

  it("maps tracks to item types", () => {
    expect(itemTypeForCategory(cat("laptop"))).toBe("asset");
    expect(itemTypeForCategory(cat("priority", { fulfillment_track: "access" }))).toBe("access");
    expect(itemTypeForCategory(cat("safety", { domain: "training" }))).toBe("task");
  });

  it("hides insurance and real estate from HR unless shown explicitly", () => {
    expect(showInOnboarding(cat("policy", { domain: "insurance" }))).toBe(false);
    expect(showInOnboarding(cat("policy", { domain: "insurance", show_in_onboarding: true }))).toBe(true);
    expect(showInOnboarding(cat("laptop", { show_in_onboarding: false }))).toBe(false);
  });

  it("groups the visible categories by track in a fixed order", () => {
    const groups = groupByTrack([
      cat("safety", { domain: "training" }),
      cat("laptop"),
      cat("policy", { domain: "insurance" }),
      cat("priority", { fulfillment_track: "access" }),
      cat("phone"),
      cat("forced", { domain: "real_estate", show_in_onboarding: true }),
    ]);
    expect(groups.map((g) => [g.track, g.categories.map((c) => c.id)])).toEqual([
      ["equipment", ["laptop", "phone"]],
      ["access", ["priority"]],
      ["task", ["safety", "forced"]],
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { compareQuotes, entitledTier, type Quote } from "@/domain/vehicles/quotes";

const q = (id: string, price: number | null, model = "קורולה"): Quote => ({
  id, supplier_name: id, model, monthly_price: price, km_per_year: null, period_months: 36, delivery_date: null,
});

describe("vehicle entitlement", () => {
  const roles = [
    { tier_id: "t2", role_name: "מהנדס ביצוע", department: null },
    { tier_id: "t3", role_name: "מהנדס ביצוע", department: "הנדסה" },
  ];
  it("prefers a role and department match, then a role match", () => {
    expect(entitledTier(roles, { role: "מהנדס ביצוע", department: "הנדסה" })).toBe("t3");
    expect(entitledTier(roles, { role: "מהנדס ביצוע", department: "תכנון" })).toBe("t2");
    expect(entitledTier(roles, { role: "מזכירה" })).toBeNull();
    expect(entitledTier(roles, { role: null })).toBeNull();
  });
});

describe("quote comparison", () => {
  it("sorts by price, flags the cap, and recommends the cheapest within it", () => {
    const rows = compareQuotes([q("b", 3600), q("a", 3200), q("c", null)], 3500);
    expect(rows.map((r) => [r.quote.id, r.withinCap, r.recommended])).toEqual([
      ["a", true, true],
      ["b", false, false],
      ["c", null, false],
    ]);
  });

  it("prefers the employee's model when it costs at most ten percent more", () => {
    const rows = compareQuotes([q("cheap", 3000, "קיה נירו"), q("liked", 3250, "טויוטה קורולה היברידית")], 3500, ["קורולה"]);
    expect(rows.find((r) => r.recommended)?.quote.id).toBe("liked");
    const far = compareQuotes([q("cheap", 3000, "קיה"), q("liked", 3400, "קורולה")], 3500, ["קורולה"]);
    expect(far.find((r) => r.recommended)?.quote.id).toBe("cheap");
  });

  it("recommends nothing when every priced quote is over the cap", () => {
    expect(compareQuotes([q("a", 4000)], 3500).some((r) => r.recommended)).toBe(false);
    expect(compareQuotes([q("a", 4000)], null)[0].recommended).toBe(true);
  });
});

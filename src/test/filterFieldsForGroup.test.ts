import { describe, expect, it } from "vitest";
import { filterFieldsForGroup } from "@/hooks/useCategories";

const fields = [
  { id: "cat-a", group_id: null },
  { id: "cat-b", group_id: null },
  { id: "sub-1", group_id: "g1" },
  { id: "sub-2", group_id: "g2" },
];

describe("filterFieldsForGroup", () => {
  it("keeps category-wide fields and the sub-category's own fields", () => {
    expect(filterFieldsForGroup(fields, "g1").map((f) => f.id)).toEqual(["cat-a", "cat-b", "sub-1"]);
  });

  it("drops category-wide fields the sub-category hides, never its own", () => {
    expect(filterFieldsForGroup(fields, "g1", ["cat-a", "sub-1"]).map((f) => f.id)).toEqual(["cat-b", "sub-1"]);
  });

  it("ignores hidden ids when no sub-category is selected", () => {
    expect(filterFieldsForGroup(fields, null, ["cat-a"]).map((f) => f.id)).toEqual(["cat-a", "cat-b"]);
  });
});

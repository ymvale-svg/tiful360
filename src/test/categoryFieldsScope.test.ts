import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { fieldIdsToDelete } from "@/hooks/useCategories";

const current = [
  { id: "cat1", group_id: null },
  { id: "prio1", group_id: "prio" },
  { id: "prio2", group_id: "prio" },
  { id: "mail1", group_id: "mail" },
];

describe("saving fields of one sub-category", () => {
  it("never deletes fields of other sub-categories or the category level", () => {
    expect(fieldIdsToDelete(current, [], "mail")).toEqual(["mail1"]);
  });
  it("category-level save keeps all sub-category fields", () => {
    expect(fieldIdsToDelete(current, [], null)).toEqual(["cat1"]);
  });
  it("removes only the field the user deleted in that scope", () => {
    expect(fieldIdsToDelete(current, [{ id: "prio1" }], "prio")).toEqual(["prio2"]);
  });
});

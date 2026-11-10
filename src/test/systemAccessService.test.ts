import { describe, expect, it, vi } from "vitest";
import {
  addResource,
  importTree,
  saveGroup,
  saveSystem,
  setGroupResource,
} from "@/services/systemAccess";

type Db = Parameters<typeof saveSystem>[0];

/** A chainable fake of supabase.from(): records each call, resolves to `result`. */
function fakeDb(result: { data?: unknown; error?: unknown } = { data: { id: "new" }, error: null }) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["insert", "update", "upsert", "delete", "select", "eq", "order", "single"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null, ...result });
  const from = vi.fn((table: string) => {
    calls.push(["from", [table]]);
    return chain;
  });
  const rpc = vi.fn().mockResolvedValue({ data: { added: 2, missing: 0, returned: 0, total: 2 }, error: null });
  return { db: { from, rpc } as unknown as Db, calls, rpc };
}
const called = (calls: Array<[string, unknown[]]>, method: string) => calls.filter(([m]) => m === method).map(([, a]) => a);

describe("system access service", () => {
  it("creates a system in the active company with a trimmed name", async () => {
    const { db, calls } = fakeDb();
    await saveSystem(db, "company-1", { name: "  פריוריטי ", provisioning: "manual" });
    expect(called(calls, "from")).toEqual([["system_access_systems"]]);
    expect(called(calls, "insert")).toEqual([[{ name: "פריוריטי", provisioning: "manual", company_id: "company-1" }]]);
  });

  it("updates a system only inside the active company", async () => {
    const { db, calls } = fakeDb();
    await saveSystem(db, "company-1", { id: "sys-1", name: "כונן P", owner_role: "it_manager" });
    expect(called(calls, "update")).toEqual([[{ name: "כונן P", owner_role: "it_manager" }]]);
    expect(called(calls, "eq")).toEqual([["id", "sys-1"], ["company_id", "company-1"]]);
  });

  it("never sends company_id for resources or groups (set by the DB from the system)", async () => {
    const { db, calls } = fakeDb();
    await addResource(db, "sys-1", "כספים");
    await saveGroup(db, "sys-1", { name: " הנדסה ", external_name: "  " });
    const inserted = called(calls, "insert").map(([row]) => row as Record<string, unknown>);
    expect(inserted).toEqual([
      { system_id: "sys-1", parent_id: null, name: "כספים", path: "כספים" },
      { name: "הנדסה", external_name: null, system_id: "sys-1" },
    ]);
    expect(inserted.every((row) => !("company_id" in row))).toBe(true);
  });

  it("nests a hand-added resource under its parent's path and keeps backslashes out of names", async () => {
    const { db, calls } = fakeDb();
    await addResource(db, "sys-1", "תב\\ע", { id: "parent", path: "תכנון" });
    expect(called(calls, "insert")[0][0]).toEqual({ system_id: "sys-1", parent_id: "parent", name: "תב/ע", path: "תכנון\\תב/ע" });
  });

  it("adds a resource to a group by upsert and removes it by delete", async () => {
    const add = fakeDb();
    await setGroupResource(add.db, "g1", "r1", "read");
    expect(called(add.calls, "upsert")).toEqual([[{ group_id: "g1", resource_id: "r1", level: "read" }, { onConflict: "group_id,resource_id" }]]);
    const remove = fakeDb();
    await setGroupResource(remove.db, "g1", "r1", null);
    expect(called(remove.calls, "delete")).toHaveLength(1);
    expect(called(remove.calls, "eq")).toEqual([["group_id", "g1"], ["resource_id", "r1"]]);
  });

  it("imports a tree through the atomic DB function", async () => {
    const { db, rpc } = fakeDb();
    await expect(importTree(db, "sys-1", ["a", "a\\b"])).resolves.toMatchObject({ added: 2 });
    expect(rpc).toHaveBeenCalledWith("import_system_access_tree", { _system_id: "sys-1", _paths: ["a", "a\\b"] });
  });

  it("throws the DB error", async () => {
    const { db } = fakeDb({ data: null, error: new Error("duplicate key") });
    await expect(saveSystem(db, "company-1", { name: "פריוריטי" })).rejects.toThrow("duplicate key");
  });
});

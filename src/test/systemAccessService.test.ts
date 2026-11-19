import { describe, expect, it, vi } from "vitest";
import {
  addResource,
  dispatchAccess,
  hasProcessRequest,
  importTree,
  inviteToTiful360,
  listRequests,
  requestAccess,
  requestRevocation,
  resolveGrant,
  saveGroup,
  saveSystem,
  setGroupResource,
} from "@/services/systemAccess";

type Db = Parameters<typeof saveSystem>[0];

/** A chainable fake of supabase.from(): records each call, resolves to `result`. */
function fakeDb(result: { data?: unknown; error?: unknown } = { data: { id: "new" }, error: null }) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["insert", "update", "upsert", "delete", "select", "eq", "order", "single", "limit", "in", "neq"]) {
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

describe("access request service", () => {
  it("requests access through the atomic DB function with the onboarding process", async () => {
    const { db, rpc } = fakeDb();
    rpc.mockResolvedValue({ data: { requestId: "r", ticketId: "t", ticketCode: "ACC-1", created: 2, skipped: 0 }, error: null });
    const picks = [{ system_id: "p", group_id: "eng" }, { system_id: "t360" }];
    await expect(requestAccess(db, "emp", picks, { onboardingProcessId: "proc", note: "  " })).resolves.toMatchObject({ created: 2 });
    expect(rpc).toHaveBeenCalledWith("request_system_access", { _employee_id: "emp", _items: picks, _onboarding_process_id: "proc", _note: null });
  });

  it("dispatches and resolves through the DB functions", async () => {
    const { db, rpc } = fakeDb();
    rpc.mockResolvedValue({ data: [{ ticketId: "t", ticketCode: "ACC-2", ownerRole: "it_manager", count: 1 }], error: null });
    await dispatchAccess(db, ["g1"], " דחוף ");
    expect(rpc).toHaveBeenCalledWith("dispatch_system_access", { _grant_ids: ["g1"], _note: "דחוף" });
    rpc.mockResolvedValue({ data: null, error: null });
    await resolveGrant(db, "g1", "done", { executedAt: "2026-11-16T06:00:00.000Z", externalUsername: " ahmad.f " });
    expect(rpc).toHaveBeenLastCalledWith("resolve_system_access_grant", {
      _grant_id: "g1", _action: "done", _executed_at: "2026-11-16T06:00:00.000Z", _external_username: "ahmad.f", _note: null,
    });
  });

  it("knows whether an onboarding process already asked", async () => {
    const yes = fakeDb({ data: [{ id: "r" }], error: null });
    await expect(hasProcessRequest(yes.db, "proc")).resolves.toBe(true);
    const no = fakeDb({ data: [], error: null });
    await expect(hasProcessRequest(no.db, "proc")).resolves.toBe(false);
  });
});

describe("Tiful360 provisioning", () => {
  const db = (result: { data?: unknown; error?: unknown }) => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: null, ...result });
    return { invoke, db: { functions: { invoke } } as unknown as Parameters<typeof inviteToTiful360>[0] };
  };
  const emp = { id: "e1", email: " ahmad@example.com ", full_name: "אחמד פוקרה" };

  it("invites through manage-users for the active company only", async () => {
    const { db: fake, invoke } = db({ data: { results: [{ status: "invited" }] } });
    await expect(inviteToTiful360(fake, "c1", emp)).resolves.toBe("ahmad@example.com");
    expect(invoke).toHaveBeenCalledWith("manage-users?action=invite", {
      body: { company_id: "c1", employees: [{ employee_id: "e1", email: "ahmad@example.com", full_name: "אחמד פוקרה" }] },
    });
  });

  it("treats an existing account as opened and a failed invite as an error", async () => {
    await expect(inviteToTiful360(db({ data: { results: [{ status: "already_exists" }] } }).db, "c1", emp)).resolves.toBe("ahmad@example.com");
    await expect(inviteToTiful360(db({ data: { results: [{ status: "failed", error: "rate limit" }] } }).db, "c1", emp)).rejects.toThrow("rate limit");
  });

  it("refuses an employee without an email before calling anything", async () => {
    const { db: fake, invoke } = db({});
    await expect(inviteToTiful360(fake, "c1", { ...emp, email: null })).rejects.toThrow("אין כתובת מייל");
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("requests by direction", () => {
  it("names both foreign keys and keeps the grants of the request's own direction", async () => {
    const rows = [
      { id: "r1", kind: "grant", opened: [{ id: "a" }], revoking: [{ id: "x" }] },
      { id: "r2", kind: "revoke", opened: [], revoking: [{ id: "b" }] },
    ];
    const { db, calls } = fakeDb({ data: rows, error: null });
    const requests = await listRequests(db, "c1", "open");
    expect(requests.map((r) => [r.id, r.system_access_grants.map((g) => g.id)])).toEqual([["r1", ["a"]], ["r2", ["b"]]]);
    const select = String(called(calls, "select")[0][0]);
    expect(select).toContain("opened:system_access_grants!system_access_grants_request_id_fkey(");
    expect(select).toContain("revoking:system_access_grants!system_access_grants_revoke_request_id_fkey(");
  });

  it("revokes all of an employee's access when no grants are named", async () => {
    const { db, rpc } = fakeDb();
    rpc.mockResolvedValue({ data: { count: 2 }, error: null });
    await requestRevocation(db, "emp", [], " מעבר מחלקה ");
    expect(rpc).toHaveBeenCalledWith("request_system_access_revocation", { _employee_id: "emp", _grant_ids: null, _note: "מעבר מחלקה" });
  });
});

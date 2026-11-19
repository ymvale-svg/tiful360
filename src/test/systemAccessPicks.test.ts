import { describe, expect, it } from "vitest";
import {
  canDispatch,
  canReject,
  canResolve,
  canReturn,
  isOpenInRequest,
  isRevoking,
  defaultEffectiveLocal,
  isSystemOwner,
  itemsToPicks,
  picksToItems,
  toLocalInput,
} from "@/domain/systemAccess/picks";
import { grantLabel, type AccessGrant } from "@/domain/systemAccess/types";

describe("access picks", () => {
  const def = defaultEffectiveLocal("2026-11-16");

  it("defaults to the first working day at 08:00", () => {
    expect(def).toBe("2026-11-16T08:00");
    expect(defaultEffectiveLocal(null)).toBe("");
  });

  it("requests a whole system when nothing inside it is picked, else one item per group and resource", () => {
    const items = picksToItems(
      {
        t360: { groupIds: [], resourceIds: [], effectiveFrom: def },
        p: { groupIds: ["eng", "plan"], resourceIds: ["single"], effectiveFrom: def },
      },
      def,
    );
    expect(items).toEqual([
      { system_id: "t360" },
      { system_id: "p", group_id: "eng" },
      { system_id: "p", group_id: "plan" },
      { system_id: "p", resource_id: "single" },
    ]);
  });

  it("sends a changed start time and round-trips it", () => {
    const changed = "2026-12-01T10:30";
    const [item] = picksToItems({ prio: { groupIds: [], resourceIds: ["fin"], effectiveFrom: changed } }, def);
    expect(item.effective_from).toBe(new Date(changed).toISOString());
    expect(itemsToPicks([item], def)).toEqual({ prio: { groupIds: [], resourceIds: ["fin"], effectiveFrom: changed } });
    expect(toLocalInput(new Date(changed).toISOString())).toBe(changed);
  });
});

describe("who acts on a grant", () => {
  const grant = (status: AccessGrant["status"], owner: { role?: string; user?: string | null } = {}) =>
    ({
      status,
      system_access_systems: { name: "כונן P", owner_role: owner.role ?? "it_manager", owner_user_id: owner.user ?? null, provisioning: "manual" },
    }) as AccessGrant;
  const manager = { userId: "m", roles: ["admin"], isManager: true };
  const it_ = { userId: "i", roles: ["it_manager"], isManager: false };
  const hr = { userId: "h", roles: ["hr"], isManager: false };

  it("lets the manager dispatch waiting grants and resolve any open one", () => {
    expect(canDispatch(grant("requested"), manager)).toBe(true);
    expect(canDispatch(grant("dispatched"), manager)).toBe(false);
    expect(canResolve(grant("requested"), manager)).toBe(true);
    expect(canResolve(grant("active"), manager)).toBe(false);
  });

  it("lets the owner resolve only what was sent to them", () => {
    expect(canResolve(grant("dispatched"), it_)).toBe(true);
    expect(canResolve(grant("requested"), it_)).toBe(false);
    expect(canResolve(grant("dispatched"), hr)).toBe(false);
    expect(canDispatch(grant("requested"), it_)).toBe(false);
  });

  it("prefers a named owner over the owner role", () => {
    expect(isSystemOwner(grant("dispatched", { user: "someone-else" }), it_)).toBe(false);
    expect(isSystemOwner(grant("dispatched", { user: "i" }), it_)).toBe(true);
  });

  it("labels a grant by system and group or resource", () => {
    const base = grant("active");
    expect(grantLabel({ ...base, system_access_groups: { name: "הנדסה", external_name: "GRP_P_Engineering" } })).toBe("כונן P · הנדסה (GRP_P_Engineering)");
    expect(grantLabel({ ...base, system_access_resources: { path: "פרויקטים\\תכנון" } })).toBe("כונן P · פרויקטים\\תכנון");
    expect(grantLabel(base)).toBe("כונן P");
  });
});

describe("revocation rules", () => {
  const g = (status: AccessGrant["status"]) =>
    ({ status, system_access_systems: { name: "כונן P", owner_role: "it_manager", owner_user_id: null, provisioning: "manual" } }) as AccessGrant;
  const manager = { userId: "m", roles: ["admin"], isManager: true };
  const it_ = { userId: "i", roles: ["it_manager"], isManager: false };

  it("dispatches and resolves revocations like grants, but never rejects them", () => {
    expect(canDispatch(g("revoke_requested"), manager)).toBe(true);
    expect(canResolve(g("revoke_dispatched"), it_)).toBe(true);
    expect(canResolve(g("revoke_requested"), it_)).toBe(false);
    expect(canReject(g("revoke_requested"))).toBe(false);
    expect(canReject(g("dispatched"))).toBe(true);
    expect(canReturn(g("revoke_dispatched"))).toBe(true);
  });

  it("counts open grants per request direction", () => {
    expect(isOpenInRequest("revoke", g("revoke_dispatched"))).toBe(true);
    expect(isOpenInRequest("revoke", g("active"))).toBe(false);
    expect(isOpenInRequest("grant", g("revoke_requested"))).toBe(false);
    expect(isRevoking(g("revoke_requested"))).toBe(true);
  });
});

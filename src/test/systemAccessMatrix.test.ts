import { describe, expect, it } from "vitest";
import { accessProtocolId, employeeProtocolRows, formatIsraelDateTime, type ProtocolGrant } from "@/domain/systemAccess/protocol";
import { accessTarget, buildMatrix, bySystem, departmentsOf, filterMatrix, type HeldGrant } from "@/domain/systemAccess/matrix";

const grant = (id: string, employee: [string, string, string | null, string?], system: [string, string], target: Record<string, unknown> = {}, status = "active") =>
  ({
    id, employee_id: employee[0], system_id: system[0], status,
    employees: { full_name: employee[1], department: employee[2], status: employee[3] ?? "active" },
    system_access_systems: { name: system[1], owner_role: "admin", owner_user_id: null, provisioning: "manual" },
    ...target,
  }) as unknown as HeldGrant;

const AHMAD: [string, string, string | null] = ["e1", "אחמד פוקרה", "הנדסה"];
const DANA: [string, string, string | null, string] = ["e2", "דנה לוי", "כספים", "leaving"];
const P: [string, string] = ["p", "כונן P"];
const PRIO: [string, string] = ["prio", "פריוריטי"];

const grants = [
  grant("g1", AHMAD, P, { system_access_groups: { name: "תכנון", external_name: null } }),
  grant("g2", AHMAD, P, { system_access_groups: { name: "הנדסה", external_name: "GRP_P_Engineering" } }),
  grant("g3", AHMAD, PRIO, { system_access_resources: { path: "רכש" } }),
  grant("g4", DANA, PRIO, { system_access_resources: { path: "כספים" } }, "revoke_requested"),
  grant("g5", DANA, ["t360", "תפעול 360"]),
];

describe("access matrix", () => {
  it("has one row per employee, cells by system, targets sorted, pending revocations marked", () => {
    const rows = buildMatrix(grants);
    expect(rows.map((r) => r.name)).toEqual(["אחמד פוקרה", "דנה לוי"]);
    expect(rows[0].cells.p.map((c) => c.label)).toEqual(["הנדסה", "תכנון"]);
    expect(rows[1].cells.prio).toEqual([{ grantId: "g4", label: "כספים", revoking: true }]);
    expect(rows[1].cells.t360[0].label).toBe("כל המערכת");
    expect(rows[1].leaving).toBe(true);
  });

  it("filters by name, department and system", () => {
    const rows = buildMatrix(grants);
    expect(filterMatrix(rows, { query: "דנה" }).map((r) => r.employeeId)).toEqual(["e2"]);
    expect(filterMatrix(rows, { department: "הנדסה" }).map((r) => r.employeeId)).toEqual(["e1"]);
    expect(filterMatrix(rows, { systemId: "t360" }).map((r) => r.employeeId)).toEqual(["e2"]);
    expect(departmentsOf(rows)).toEqual(["הנדסה", "כספים"]);
  });

  it("lists everyone with access to one system", () => {
    expect(bySystem(grants, "prio").map((r) => [r.grant.id, r.label, r.revoking])).toEqual([
      ["g3", "פריוריטי · רכש", false],
      ["g4", "פריוריטי · כספים", true],
    ]);
  });

  it("names the target of a grant", () => {
    expect(accessTarget({ system_access_groups: { name: "הנדסה", external_name: null } })).toBe("הנדסה");
    expect(accessTarget({})).toBe("כל המערכת");
  });
});


describe("employee access protocol", () => {
  const base = {
    employee_id: "e1", effective_from: "2026-11-16T06:00:00Z", executed_at: null, executed_by_name: null, external_username: null,
    request: { requested_by_name: "דנה", requested_at: "2026-11-10T09:00:00Z" },
  };
  const g = (id: string, system: string, status: string, extra: Record<string, unknown> = {}) =>
    ({ ...base, id, status, system_access_systems: { name: system }, ...extra }) as unknown as ProtocolGrant;

  it("lists every grant by system with opening and revocation, leaving out rejected ones", () => {
    const rows = employeeProtocolRows([
      g("1", "פריוריטי", "active", { system_access_resources: { path: "כספים" }, executed_at: "2026-11-16T07:00:00Z", executed_by_name: "מנהל", external_username: "AHMADF" }),
      g("2", "כונן P", "revoked", {
        system_access_groups: { name: "הנדסה", external_name: "GRP_P_Engineering" },
        executed_at: "2026-11-16T05:40:00Z", executed_by_name: "איש IT", revoked_at: "2026-12-30T15:00:00Z", revoked_by_name: "איש IT",
      }),
      g("3", "כונן P", "rejected", { rejection_reason: "לא נדרש" }),
    ]);
    expect(rows.map((r) => [r.system, r.target, r.externalGroup, r.status, r.requestedBy, r.username])).toEqual([
      ["כונן P", "הנדסה", "GRP_P_Engineering", "נותק", "דנה", null],
      ["פריוריטי", "כספים", null, "נפתח", "דנה", "AHMADF"],
    ]);
    expect(rows[0].revokedBy).toBe("איש IT");
  });

  it("formats times in Israel time and names the document per employee and day", () => {
    expect(formatIsraelDateTime("2026-11-16T06:00:00Z")).toBe("16/11/2026 08:00");
    expect(formatIsraelDateTime(null)).toBe("—");
    expect(accessProtocolId("1a2b3c4d-0000", new Date("2026-11-16T22:30:00Z"))).toBe("ACC-P-1A2B3C4D-20261117");
  });
});

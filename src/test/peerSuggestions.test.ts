import { describe, expect, it } from "vitest";
import { peersOf, suggestAccess, suggestEquipment, unusualGrant } from "@/domain/suggestions/peers";

const emp = (id: string, role: string | null, department: string | null, status = "active") => ({ id, role, department, status });
const EMPLOYEES = [
  emp("new", "מהנדס ביצוע", "הנדסה", "onboarding"),
  emp("a", "מהנדס ביצוע", "הנדסה"),
  emp("b", "מהנדס ביצוע", "הנדסה"),
  emp("c", "מהנדס ביצוע", "הנדסה"),
  emp("d", "מהנדס ביצוע", "תכנון"),
  emp("gone", "מהנדס ביצוע", "הנדסה", "inactive"),
  emp("x", "מזכירה", "הנהלה"),
];

describe("peers", () => {
  it("prefers role and department, ignores the employee and people who left", () => {
    expect(peersOf({ id: "new", role: "מהנדס ביצוע", department: "הנדסה" }, EMPLOYEES)).toEqual({ peerIds: ["a", "b", "c"], basis: "role+department" });
  });

  it("falls back to the role, then the department, and needs at least two peers", () => {
    expect(peersOf({ id: "z", role: "מהנדס ביצוע", department: "רכש" }, EMPLOYEES)?.basis).toBe("role");
    expect(peersOf({ id: "z", role: "חדש", department: "הנדסה" }, EMPLOYEES)).toEqual({ peerIds: ["a", "b", "c"], basis: "department" });
    expect(peersOf({ id: "z", role: "מזכירה", department: null }, EMPLOYEES)).toBeNull();
  });
});

describe("suggestions", () => {
  const peers = ["a", "b", "c"];

  it("suggests equipment at least half the peers hold, most common first", () => {
    const assets = [
      { current_owner_id: "a", category_id: "laptop", group_id: "dell" },
      { current_owner_id: "b", category_id: "laptop", group_id: "dell" },
      { current_owner_id: "c", category_id: "laptop", group_id: "dell" },
      { current_owner_id: "a", category_id: "phone", group_id: null },
      { current_owner_id: "b", category_id: "phone", group_id: null },
      { current_owner_id: "a", category_id: "monitor", group_id: null },
      { current_owner_id: "a", category_id: "monitor", group_id: null },
      { current_owner_id: "x", category_id: "printer", group_id: null },
    ];
    expect(suggestEquipment(peers, assets)).toEqual([
      { key: { category_id: "laptop", group_id: "dell" }, count: 3, of: 3 },
      { key: { category_id: "phone", group_id: null }, count: 2, of: 3 },
    ]);
  });

  it("suggests access the same way", () => {
    const grants = [
      { employee_id: "a", system_id: "p", group_id: "eng", resource_id: null },
      { employee_id: "b", system_id: "p", group_id: "eng", resource_id: null },
      { employee_id: "c", system_id: "prio", group_id: null, resource_id: "fin" },
    ];
    expect(suggestAccess(peers, grants)).toEqual([{ key: { system_id: "p", group_id: "eng", resource_id: null }, count: 2, of: 3 }]);
  });
});

describe("unusual access", () => {
  const held = [
    { employee_id: "a", system_id: "p", group_id: "eng", resource_id: null },
    { employee_id: "x", system_id: "prio", group_id: null, resource_id: "fin" },
  ];

  it("flags access no peer holds, naming the peer group", () => {
    expect(unusualGrant({ employee_id: "new", system_id: "prio", group_id: null, resource_id: "fin" }, EMPLOYEES, held))
      .toEqual({ basis: "role+department", peers: 3 });
  });

  it("does not flag access a peer holds, or an employee without enough peers", () => {
    expect(unusualGrant({ employee_id: "new", system_id: "p", group_id: "eng", resource_id: null }, EMPLOYEES, held)).toBeNull();
    expect(unusualGrant({ employee_id: "x", system_id: "p", group_id: "eng", resource_id: null }, EMPLOYEES, held)).toBeNull();
  });
});

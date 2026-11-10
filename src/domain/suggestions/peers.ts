// Suggestions from peers: what employees in the same role (and department) hold today.
// Deterministic on purpose: every suggestion and every warning can be explained by the peers
// it came from, and nothing is invented.

export interface PeerEmployee {
  id: string | null;
  role: string | null;
  department: string | null;
  status: string | null;
}

export type PeerBasis = "role+department" | "role" | "department";

export const PEER_BASIS_LABEL: Record<PeerBasis, string> = {
  "role+department": "באותו תפקיד ובאותה מחלקה",
  role: "באותו תפקיד",
  department: "באותה מחלקה",
};

/** At least this many peers before suggesting or warning: one colleague is an anecdote. */
export const MIN_PEERS = 2;
/** A thing is suggested when at least this share of the peers hold it. */
export const SUGGEST_SHARE = 0.5;

const active = (e: PeerEmployee) => e.status === "active" || e.status === "leaving";

/** The closest peer group with enough people: role and department, else role, else department. */
export function peersOf(
  employee: { id?: string | null; role?: string | null; department?: string | null },
  employees: PeerEmployee[],
): { peerIds: string[]; basis: PeerBasis } | null {
  const others = employees.filter((e) => e.id && e.id !== employee.id && active(e));
  const role = employee.role?.trim();
  const dept = employee.department?.trim();
  const tries: Array<[PeerBasis, (e: PeerEmployee) => boolean]> = [
    ["role+department", (e) => !!role && !!dept && e.role?.trim() === role && e.department?.trim() === dept],
    ["role", (e) => !!role && e.role?.trim() === role],
    ["department", (e) => !!dept && e.department?.trim() === dept],
  ];
  for (const [basis, match] of tries) {
    const peerIds = others.filter(match).map((e) => e.id!);
    if (peerIds.length >= MIN_PEERS) return { peerIds, basis };
  }
  return null;
}

export interface Suggested<K> {
  key: K;
  /** How many peers hold it, out of how many. */
  count: number;
  of: number;
}

/** Keys held by at least SUGGEST_SHARE of the peers, most common first. */
function common<T, K>(rows: T[], peerIds: string[], ownerOf: (r: T) => string | null, keyOf: (r: T) => K | null): Suggested<K>[] {
  const peers = new Set(peerIds);
  const holders = new Map<string, { key: K; owners: Set<string> }>();
  for (const r of rows) {
    const owner = ownerOf(r);
    const key = keyOf(r);
    if (!owner || !peers.has(owner) || key === null) continue;
    const id = JSON.stringify(key);
    const entry = holders.get(id) ?? { key, owners: new Set<string>() };
    entry.owners.add(owner);
    holders.set(id, entry);
  }
  return [...holders.values()]
    .filter((h) => h.owners.size / peers.size >= SUGGEST_SHARE)
    .map((h) => ({ key: h.key, count: h.owners.size, of: peers.size }))
    .sort((a, b) => b.count - a.count);
}

export interface EquipmentKey {
  category_id: string;
  group_id: string | null;
}

/** Equipment (category and sub-category) most peers hold now. */
export function suggestEquipment(
  peerIds: string[],
  assets: Array<{ current_owner_id: string | null; category_id: string | null; group_id: string | null }>,
): Suggested<EquipmentKey>[] {
  return common(assets, peerIds, (a) => a.current_owner_id, (a) =>
    a.category_id ? { category_id: a.category_id, group_id: a.group_id ?? null } : null);
}

export interface AccessKey {
  system_id: string;
  group_id: string | null;
  resource_id: string | null;
}

const accessKey = (g: { system_id: string; group_id: string | null; resource_id: string | null }): AccessKey => ({
  system_id: g.system_id,
  group_id: g.group_id ?? null,
  resource_id: g.resource_id ?? null,
});

/** System access most peers hold now. */
export function suggestAccess(
  peerIds: string[],
  grants: Array<{ employee_id: string; system_id: string; group_id: string | null; resource_id: string | null }>,
): Suggested<AccessKey>[] {
  return common(grants, peerIds, (g) => g.employee_id, (g) => accessKey(g));
}

/**
 * Whether a grant is unusual for the employee: they have enough peers and none of them holds it.
 * Returns the peer group so the warning can say against whom it was measured.
 */
export function unusualGrant(
  grant: { employee_id: string; system_id: string; group_id: string | null; resource_id: string | null },
  employees: PeerEmployee[],
  heldGrants: Array<{ employee_id: string; system_id: string; group_id: string | null; resource_id: string | null }>,
): { basis: PeerBasis; peers: number } | null {
  const employee = employees.find((e) => e.id === grant.employee_id);
  if (!employee) return null;
  const group = peersOf(employee, employees);
  if (!group) return null;
  const key = JSON.stringify(accessKey(grant));
  const peers = new Set(group.peerIds);
  const heldByPeer = heldGrants.some((g) => peers.has(g.employee_id) && JSON.stringify(accessKey(g)) === key);
  return heldByPeer ? null : { basis: group.basis, peers: group.peerIds.length };
}

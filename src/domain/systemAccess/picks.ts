// What HR picks in the access picker, and who may act on a grant.
import type { AccessGrant, AccessPick } from "@/domain/systemAccess/types";

/** Per system: picked access groups and resources, and the start time as "YYYY-MM-DDTHH:mm" (local). */
export type PickState = Record<string, { groupIds: string[]; resourceIds: string[]; effectiveFrom: string }>;

/** The employee's first day at 08:00, as a datetime-local value; empty when there is no start date. */
export function defaultEffectiveLocal(startDate: string | null | undefined): string {
  return startDate ? `${startDate.slice(0, 10)}T08:00` : "";
}

/**
 * One request item per picked group or resource; a system with nothing picked inside it is
 * requested as a whole. A start left at the default is omitted so the DB applies it.
 */
export function picksToItems(state: PickState, defaultLocal: string): AccessPick[] {
  return Object.entries(state).flatMap(([systemId, pick]) => {
    const from = pick.effectiveFrom && pick.effectiveFrom !== defaultLocal
      ? new Date(pick.effectiveFrom).toISOString()
      : undefined;
    const withFrom = (item: AccessPick): AccessPick => (from ? { ...item, effective_from: from } : item);
    if (pick.groupIds.length === 0 && pick.resourceIds.length === 0) return [withFrom({ system_id: systemId })];
    return [
      ...pick.groupIds.map((group_id) => withFrom({ system_id: systemId, group_id })),
      ...pick.resourceIds.map((resource_id) => withFrom({ system_id: systemId, resource_id })),
    ];
  });
}

/** Back from stored items (an onboarding draft) to picker state. */
export function itemsToPicks(items: AccessPick[] | null | undefined, defaultLocal: string): PickState {
  const state: PickState = {};
  for (const item of items ?? []) {
    const entry = (state[item.system_id] ??= { groupIds: [], resourceIds: [], effectiveFrom: defaultLocal });
    if (item.group_id) entry.groupIds.push(item.group_id);
    if (item.resource_id) entry.resourceIds.push(item.resource_id);
    if (item.effective_from) entry.effectiveFrom = toLocalInput(item.effective_from);
  }
  return state;
}

/** ISO timestamp → "YYYY-MM-DDTHH:mm" in the browser's time zone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface Actor {
  userId: string | null;
  roles: readonly string[];
  /** Admin of the company (or super admin): runs the hub. */
  isManager: boolean;
}

/** The system's owner: its owner user, or anyone with its owner role when no user is set. */
export function isSystemOwner(grant: Pick<AccessGrant, "system_access_systems">, actor: Actor): boolean {
  const system = grant.system_access_systems;
  if (!system) return false;
  if (system.owner_user_id) return system.owner_user_id === actor.userId;
  return actor.roles.includes(system.owner_role);
}

/** Mirrors resolve_system_access_grant: the manager acts on any open grant, the owner on grants sent to them. */
export function canResolve(grant: Pick<AccessGrant, "status" | "system_access_systems">, actor: Actor): boolean {
  if (grant.status !== "requested" && grant.status !== "dispatched") return false;
  return actor.isManager || (grant.status === "dispatched" && isSystemOwner(grant, actor));
}

export function canDispatch(grant: Pick<AccessGrant, "status">, actor: Actor): boolean {
  return actor.isManager && grant.status === "requested";
}

export const isOpenGrant = (g: Pick<AccessGrant, "status">) => g.status === "requested" || g.status === "dispatched";

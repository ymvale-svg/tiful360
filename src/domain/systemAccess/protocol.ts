// Breaking access groups down into the resources they open, for IT's protocol and for audits,
// and the employee's access protocol.
import { GRANT_STATUS_LABEL, type AccessGrant } from "@/domain/systemAccess/types";

export type AccessLevel = "read" | "write";

export interface ProtocolGroup {
  name: string;
  external_name: string | null;
  resources: Array<{ path: string; level: AccessLevel }>;
}

export interface ProtocolRow {
  group: string;
  externalName: string | null;
  path: string;
  level: AccessLevel;
}

export const LEVEL_LABEL: Record<AccessLevel, string> = { read: "קריאה בלבד", write: "קריאה וכתיבה" };

/** One row per group × resource, groups in the given order, resources by path. */
export function buildGroupProtocol(groups: ProtocolGroup[]): ProtocolRow[] {
  return groups.flatMap((g) =>
    [...g.resources]
      .sort((a, b) => a.path.localeCompare(b.path, "he"))
      .map((r) => ({ group: g.name, externalName: g.external_name, path: r.path, level: r.level })),
  );
}

/** The access a set of groups gives in total: per resource, write wins over read. */
export function effectiveAccess(groups: ProtocolGroup[]): Map<string, AccessLevel> {
  const out = new Map<string, AccessLevel>();
  for (const g of groups) {
    for (const r of g.resources) {
      if (out.get(r.path) !== "write") out.set(r.path, r.level);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// The employee's access protocol: every grant, by system, with its full history.

export type ProtocolGrant = AccessGrant & {
  request?: { requested_by_name: string; requested_at: string } | null;
};

export interface EmployeeProtocolRow {
  system: string;
  target: string;
  externalGroup: string | null;
  status: string;
  requestedBy: string | null;
  effectiveFrom: string;
  openedAt: string | null;
  openedBy: string | null;
  username: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}

/** "16/11/2026 08:00" in Israel time; "—" when empty. */
export function formatIsraelDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso)).replace(",", "");
}

/** Rows by system, then target, then start. Rejected grants are left out: no access was ever given. */
export function employeeProtocolRows(grants: ProtocolGrant[]): EmployeeProtocolRow[] {
  return grants
    .filter((g) => g.status !== "rejected")
    .map((g) => ({
      system: g.system_access_systems?.name ?? "מערכת",
      target: g.system_access_groups?.name ?? g.system_access_resources?.path ?? "כל המערכת",
      externalGroup: g.system_access_groups?.external_name ?? null,
      status: GRANT_STATUS_LABEL[g.status] ?? g.status,
      requestedBy: g.request?.requested_by_name ?? null,
      effectiveFrom: g.effective_from,
      openedAt: g.executed_at,
      openedBy: g.executed_by_name,
      username: g.external_username,
      revokedAt: g.revoked_at ?? null,
      revokedBy: g.revoked_by_name ?? null,
    }))
    .sort((a, b) =>
      a.system.localeCompare(b.system, "he") || a.target.localeCompare(b.target, "he") || a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** ACC-P-<first 8 of employee id>-<yyyymmdd>, e.g. ACC-P-1A2B3C4D-20261116. */
export function accessProtocolId(employeeId: string, at: Date = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(at).replace(/-/g, "");
  return `ACC-P-${employeeId.slice(0, 8).toUpperCase()}-${day}`;
}

// Who holds which access: employees against systems, for the matrix and periodic reviews.
import { grantLabel, type AccessGrant } from "@/domain/systemAccess/types";

export type HeldGrant = AccessGrant & {
  employees: { full_name: string; department: string | null; status: string } | null;
};

export interface MatrixCell {
  grantId: string;
  /** The group, resource or "כל המערכת". */
  label: string;
  /** A revocation is pending. */
  revoking: boolean;
}

export interface MatrixRow {
  employeeId: string;
  name: string;
  department: string | null;
  leaving: boolean;
  cells: Record<string, MatrixCell[]>;
}

/** The part of a grant inside its system: "הנדסה", "כספים", or the whole system. */
export function accessTarget(g: Pick<AccessGrant, "system_access_groups" | "system_access_resources">): string {
  return g.system_access_groups?.name ?? g.system_access_resources?.path ?? "כל המערכת";
}

const revoking = (g: Pick<AccessGrant, "status">) => g.status === "revoke_requested" || g.status === "revoke_dispatched";

/** One row per employee holding access, sorted by name; cells keyed by system id. */
export function buildMatrix(grants: HeldGrant[]): MatrixRow[] {
  const rows = new Map<string, MatrixRow>();
  for (const g of grants) {
    const row = rows.get(g.employee_id) ?? {
      employeeId: g.employee_id,
      name: g.employees?.full_name ?? "—",
      department: g.employees?.department ?? null,
      leaving: g.employees?.status === "leaving",
      cells: {},
    };
    (row.cells[g.system_id] ??= []).push({ grantId: g.id, label: accessTarget(g), revoking: revoking(g) });
    rows.set(g.employee_id, row);
  }
  for (const row of rows.values()) {
    for (const cells of Object.values(row.cells)) cells.sort((a, b) => a.label.localeCompare(b.label, "he"));
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export interface MatrixFilter {
  query?: string;
  department?: string | null;
  systemId?: string | null;
}

export function filterMatrix(rows: MatrixRow[], f: MatrixFilter): MatrixRow[] {
  const q = f.query?.trim();
  return rows.filter(
    (r) =>
      (!q || r.name.includes(q)) &&
      (!f.department || r.department === f.department) &&
      (!f.systemId || (r.cells[f.systemId]?.length ?? 0) > 0),
  );
}

/** "Everyone with access to Priority › כספים": one line per grant of the system, by employee. */
export function bySystem(grants: HeldGrant[], systemId: string): Array<{ grant: HeldGrant; label: string; revoking: boolean }> {
  return grants
    .filter((g) => g.system_id === systemId)
    .map((grant) => ({ grant, label: grantLabel(grant), revoking: revoking(grant) }))
    .sort((a, b) =>
      (a.grant.employees?.full_name ?? "").localeCompare(b.grant.employees?.full_name ?? "", "he") ||
      accessTarget(a.grant).localeCompare(accessTarget(b.grant), "he"));
}

/** Departments present in the matrix, for the filter. */
export function departmentsOf(rows: MatrixRow[]): string[] {
  return [...new Set(rows.map((r) => r.department).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b, "he"));
}

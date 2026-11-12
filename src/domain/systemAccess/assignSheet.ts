// The matrix as a spreadsheet the admin fills once: one row per employee, one column per thing that
// can be opened (a system as a whole, or each of its access groups / top-level resources, as in the
// access picker). A mark in a cell means the employee holds that access; it is then entered directly
// (assign_system_access_direct), without a request or approval.
import type { AccessGroup, AccessResource, AccessSystem } from "@/domain/systemAccess/types";
import type { DirectAssignRow } from "@/services/systemAccess";

export interface SheetColumn {
  header: string;
  system_id: string;
  group_id: string | null;
  resource_id: string | null;
}

export interface SheetEmployee {
  id: string;
  full_name: string;
  employee_code?: string | null;
  department?: string | null;
  start_date?: string | null;
  status?: string | null;
}

export interface SheetCatalog {
  groups: Array<Pick<AccessGroup, "id" | "system_id" | "name">>;
  resources: Array<Pick<AccessResource, "id" | "system_id" | "name">>;
}

export interface HeldTarget {
  employee_id: string;
  system_id: string;
  group_id: string | null;
  resource_id: string | null;
}

export const COL_ID = "מזהה פנימי (לא לשנות)";
export const COL_CODE = "מספר עובד";
export const COL_NAME = "שם עובד";
export const COL_DEPARTMENT = "מחלקה";
export const COL_FROM = "בתוקף מ (ריק = יום הקליטה)";
export const COL_USERNAME = "שם משתמש (לא חובה)";
const FIXED = [COL_NAME, COL_CODE, COL_DEPARTMENT, COL_FROM, COL_USERNAME];

/** Marks that mean "has this access". Anything else (empty, "לא", "0") means no. */
const YES = new Set(["v", "✓", "✔", "x", "1", "כן", "yes", "y", "true", "+", "*"]);
export const isMarked = (value: unknown) => YES.has(String(value ?? "").trim().toLowerCase());

const SEP = " · ";

/** Columns in the picker's order: systems with groups by group, otherwise by resource, else whole. */
export function sheetColumns(systems: Array<Pick<AccessSystem, "id" | "name" | "is_active">>, catalog: SheetCatalog): SheetColumn[] {
  return systems.filter((s) => s.is_active).flatMap((s) => {
    const groups = catalog.groups.filter((g) => g.system_id === s.id);
    const resources = groups.length === 0 ? catalog.resources.filter((r) => r.system_id === s.id) : [];
    const whole: SheetColumn = { header: s.name, system_id: s.id, group_id: null, resource_id: null };
    return [
      whole,
      ...groups.map((g) => ({ header: `${s.name}${SEP}${g.name}`, system_id: s.id, group_id: g.id, resource_id: null })),
      ...resources.map((r) => ({ header: `${s.name}${SEP}${r.name}`, system_id: s.id, group_id: null, resource_id: r.id })),
    ];
  });
}

const sameTarget = (c: SheetColumn, h: HeldTarget) =>
  c.system_id === h.system_id && c.group_id === h.group_id && c.resource_id === h.resource_id;

/** Header row plus one row per current employee, with access already held marked "V". */
export function buildSheet(employees: SheetEmployee[], columns: SheetColumn[], held: HeldTarget[]): string[][] {
  const header = [...FIXED, ...columns.map((c) => c.header), COL_ID];
  const rows = employees
    .filter((e) => e.status !== "inactive")
    .map((e) => [
      e.full_name,
      e.employee_code ?? "",
      e.department ?? "",
      "",
      "",
      ...columns.map((c) => (held.some((h) => h.employee_id === e.id && sameTarget(c, h)) ? "V" : "")),
      e.id,
    ]);
  return [header, ...rows];
}

export interface ParsedSheet {
  rows: DirectAssignRow[];
  /** Employees with at least one marked access. */
  employees: number;
  errors: string[];
  /** Headers that are not an employee field and match no system column (ignored). */
  unknownColumns: string[];
}

const norm = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ");

/** "dd/mm/yyyy", "yyyy-mm-dd" or an Excel serial date → "yyyy-mm-dd"; null when empty, undefined when unreadable. */
export function parseSheetDate(value: unknown, fromSerial?: (n: number) => { y: number; m: number; d: number } | null): string | null | undefined {
  if (value === null || value === undefined || norm(value) === "") return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (typeof value === "number") {
    const d = fromSerial?.(value);
    return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : undefined;
  }
  const s = norm(value);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return undefined;
}

/** Back from the filled sheet (sheet_to_json rows keyed by header) to direct-assignment rows. */
export function parseSheet(
  records: Array<Record<string, unknown>>,
  columns: SheetColumn[],
  employees: SheetEmployee[],
  fromSerial?: (n: number) => { y: number; m: number; d: number } | null,
): ParsedSheet {
  const byHeader = new Map(columns.map((c) => [norm(c.header), c]));
  const headers = new Set(records.flatMap((r) => Object.keys(r)));
  const known = new Set([...FIXED, COL_ID].map(norm));
  const unknownColumns = [...headers].filter((h) => !known.has(norm(h)) && !byHeader.has(norm(h)) && !h.startsWith("__EMPTY"));

  const byId = new Map(employees.map((e) => [e.id, e]));
  const byCode = new Map(employees.filter((e) => e.employee_code).map((e) => [norm(e.employee_code), e]));
  const byName = new Map<string, SheetEmployee[]>();
  for (const e of employees) byName.set(norm(e.full_name), [...(byName.get(norm(e.full_name)) ?? []), e]);

  const rows: DirectAssignRow[] = [];
  const errors: string[] = [];
  const withAccess = new Set<string>();

  records.forEach((rec, i) => {
    const line = i + 2; // header is row 1
    const get = (h: string) => {
      const key = Object.keys(rec).find((k) => norm(k) === norm(h));
      return key === undefined ? undefined : rec[key];
    };
    const marked = Object.entries(rec)
      .map(([h, v]) => ({ col: byHeader.get(norm(h)), v }))
      .filter((x): x is { col: SheetColumn; v: unknown } => !!x.col && isMarked(x.v))
      .map((x) => x.col);
    if (marked.length === 0) return;

    const id = norm(get(COL_ID));
    const code = norm(get(COL_CODE));
    const name = norm(get(COL_NAME));
    let emp = id ? byId.get(id) : undefined;
    if (!emp && code) emp = byCode.get(code);
    if (!emp && name) {
      const same = byName.get(name) ?? [];
      if (same.length > 1) {
        errors.push(`שורה ${line}: יש כמה עובדים בשם "${name}" – יש למלא מספר עובד`);
        return;
      }
      emp = same[0];
    }
    if (!emp) {
      errors.push(`שורה ${line}: העובד ${name || code || id || "(ללא שם)"} לא נמצא בחברה`);
      return;
    }

    const day = parseSheetDate(get(COL_FROM), fromSerial);
    if (day === undefined) {
      errors.push(`שורה ${line}: תאריך "${norm(get(COL_FROM))}" לא מובן (dd/mm/yyyy)`);
      return;
    }
    // A date means that day at 08:00 Israel time (applied by the DB), like the default.
    const effective_date = day;
    const username = norm(get(COL_USERNAME)) || null;

    withAccess.add(emp.id);
    for (const c of marked) {
      rows.push({
        employee_id: emp.id,
        system_id: c.system_id,
        group_id: c.group_id,
        resource_id: c.resource_id,
        effective_date,
        external_username: username,
      });
    }
  });

  return { rows, employees: withAccess.size, errors, unknownColumns };
}

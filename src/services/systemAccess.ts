// Data access for the system access catalog. Functions take the client as a parameter so they
// can be tested with a fake. company_id of resources and groups is set by DB triggers.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccessGrant,
  AccessGroup,
  AccessPick,
  AccessRequest,
  AccessResource,
  AccessSystem,
} from "@/domain/systemAccess/types";
import type { AccessLevel } from "@/domain/systemAccess/protocol";

// The catalog tables are newer than the generated types, so they are queried untyped here and
// typed by the row interfaces in src/domain/systemAccess/types.ts.
type Db = Pick<SupabaseClient, "from" | "rpc">;

const fail = (error: unknown) => {
  if (error) throw error;
};

export async function listSystems(db: Db, companyId: string): Promise<AccessSystem[]> {
  const { data, error } = await db
    .from("system_access_systems")
    .select("*")
    .eq("company_id", companyId)
    .order("sort_order")
    .order("name");
  fail(error);
  return (data ?? []) as AccessSystem[];
}

export async function saveSystem(
  db: Db,
  companyId: string,
  system: Partial<AccessSystem> & Pick<AccessSystem, "name">,
): Promise<AccessSystem> {
  const { id, ...fields } = system;
  const payload = { ...fields, name: fields.name.trim() };
  const query = id
    ? db.from("system_access_systems").update(payload).eq("id", id).eq("company_id", companyId)
    : db.from("system_access_systems").insert({ ...payload, company_id: companyId });
  const { data, error } = await query.select("*").single();
  fail(error);
  return data as AccessSystem;
}

export async function listResources(db: Db, systemId: string): Promise<AccessResource[]> {
  const { data, error } = await db
    .from("system_access_resources")
    .select("*")
    .eq("system_id", systemId)
    .order("path");
  fail(error);
  return (data ?? []) as AccessResource[];
}

/** A hand-added resource (environment, project). Its path is its parent's path plus its name. */
export async function addResource(
  db: Db,
  systemId: string,
  name: string,
  parent?: Pick<AccessResource, "id" | "path"> | null,
): Promise<AccessResource> {
  const clean = name.trim().replace(/\\/g, "/");
  const { data, error } = await db
    .from("system_access_resources")
    .insert({
      system_id: systemId,
      parent_id: parent?.id ?? null,
      name: clean,
      path: parent ? `${parent.path}\\${clean}` : clean,
    })
    .select("*")
    .single();
  fail(error);
  return data as AccessResource;
}

export async function setResourceActive(db: Db, resourceId: string, isActive: boolean) {
  const { error } = await db.from("system_access_resources").update({ is_active: isActive }).eq("id", resourceId);
  fail(error);
}

export async function listGroups(db: Db, systemId: string): Promise<AccessGroup[]> {
  const { data, error } = await db
    .from("system_access_groups")
    .select("*, system_access_group_resources(resource_id, level)")
    .eq("system_id", systemId)
    .order("name");
  fail(error);
  return (data ?? []) as AccessGroup[];
}

export async function saveGroup(
  db: Db,
  systemId: string,
  group: Pick<AccessGroup, "name"> & Partial<Pick<AccessGroup, "id" | "external_name" | "description" | "is_active">>,
) {
  const { id, ...fields } = group;
  const payload = {
    ...fields,
    name: fields.name.trim(),
    external_name: fields.external_name?.trim() || null,
  };
  const query = id
    ? db.from("system_access_groups").update(payload).eq("id", id).eq("system_id", systemId)
    : db.from("system_access_groups").insert({ ...payload, system_id: systemId });
  const { error } = await query;
  fail(error);
}

/** Put a resource in a group at a level, or take it out (level null). */
export async function setGroupResource(db: Db, groupId: string, resourceId: string, level: AccessLevel | null) {
  if (level === null) {
    const { error } = await db
      .from("system_access_group_resources")
      .delete()
      .eq("group_id", groupId)
      .eq("resource_id", resourceId);
    fail(error);
    return;
  }
  const { error } = await db
    .from("system_access_group_resources")
    .upsert({ group_id: groupId, resource_id: resourceId, level }, { onConflict: "group_id,resource_id" });
  fail(error);
}

export interface TreeImportResult {
  added: number;
  missing: number;
  returned: number;
  total: number;
}

/** Import a folder tree in one DB transaction; folders no longer present are flagged, not deleted. */
export async function importTree(db: Db, systemId: string, paths: string[]): Promise<TreeImportResult> {
  const { data, error } = await db.rpc("import_system_access_tree", { _system_id: systemId, _paths: paths });
  fail(error);
  return data as TreeImportResult;
}

// ---------------------------------------------------------------------------------------
// Requests and grants. Clients only read these tables; every change goes through a DB function.

const GRANT_SELECT =
  "*, system_access_systems(name, owner_role, owner_user_id, provisioning), system_access_groups(name, external_name), system_access_resources(path)";

// Grants point at requests twice (the request that opened them, the one that revokes them),
// so each embed names its foreign key.
const BY_REQUEST = "system_access_grants!system_access_grants_request_id_fkey";
const BY_REVOKE = "system_access_grants!system_access_grants_revoke_request_id_fkey";

export async function listRequests(db: Db, companyId: string, status: "open" | "done"): Promise<AccessRequest[]> {
  const { data, error } = await db
    .from("system_access_requests")
    .select(
      `*, employees(full_name, employee_code, role, department, start_date, email), opened:${BY_REQUEST}(${GRANT_SELECT}), revoking:${BY_REVOKE}(${GRANT_SELECT})`,
    )
    .eq("company_id", companyId)
    .eq("status", status)
    .order("requested_at", { ascending: false })
    .limit(status === "done" ? 50 : 500);
  fail(error);
  type Row = Omit<AccessRequest, "system_access_grants"> & { opened?: AccessGrant[]; revoking?: AccessGrant[] };
  return ((data ?? []) as Row[]).map(({ opened, revoking, ...r }) => ({
    ...r,
    system_access_grants: (r.kind === "revoke" ? revoking : opened) ?? [],
  }));
}

export async function listProcessGrants(db: Db, onboardingProcessId: string): Promise<AccessGrant[]> {
  const { data, error } = await db
    .from("system_access_requests")
    .select(`grants:${BY_REQUEST}(${GRANT_SELECT})`)
    .eq("onboarding_process_id", onboardingProcessId);
  fail(error);
  return ((data ?? []) as Array<{ grants: AccessGrant[] }>).flatMap((r) => r.grants);
}

export interface RequestAccessResult {
  requestId: string;
  ticketId: string;
  ticketCode: string;
  created: number;
  skipped: number;
}

export async function requestAccess(
  db: Db,
  employeeId: string,
  picks: AccessPick[],
  options: { onboardingProcessId?: string | null; note?: string | null } = {},
): Promise<RequestAccessResult> {
  const { data, error } = await db.rpc("request_system_access", {
    _employee_id: employeeId,
    _items: picks,
    _onboarding_process_id: options.onboardingProcessId ?? null,
    _note: options.note?.trim() || null,
  });
  fail(error);
  return data as RequestAccessResult;
}

export async function dispatchAccess(db: Db, grantIds: string[], note?: string | null) {
  const { data, error } = await db.rpc("dispatch_system_access", { _grant_ids: grantIds, _note: note?.trim() || null });
  fail(error);
  return (data ?? []) as Array<{ ticketId: string; ticketCode: string; ownerRole: string; count: number }>;
}

export type GrantAction = "done" | "reject" | "return";

export async function resolveGrant(
  db: Db,
  grantId: string,
  action: GrantAction,
  details: { executedAt?: string | null; externalUsername?: string | null; note?: string | null } = {},
) {
  const { error } = await db.rpc("resolve_system_access_grant", {
    _grant_id: grantId,
    _action: action,
    _executed_at: details.executedAt ?? null,
    _external_username: details.externalUsername?.trim() || null,
    _note: details.note?.trim() || null,
  });
  fail(error);
}

export interface PickerCatalog {
  groups: Array<Pick<AccessGroup, "id" | "system_id" | "name" | "external_name">>;
  /** Top-level resources only (environments, projects, a drive's first level). */
  resources: Array<Pick<AccessResource, "id" | "system_id" | "name" | "path">>;
}

/** What can be requested: active groups and active top-level resources of the company's systems. */
export async function listPickerCatalog(db: Db, companyId: string): Promise<PickerCatalog> {
  const [groups, resources] = await Promise.all([
    db.from("system_access_groups").select("id, system_id, name, external_name").eq("company_id", companyId).eq("is_active", true).order("name"),
    db.from("system_access_resources").select("id, system_id, name, path").eq("company_id", companyId).eq("is_active", true)
      .is("parent_id", null).is("missing_since", null).order("name"),
  ]);
  fail(groups.error);
  fail(resources.error);
  return { groups: (groups.data ?? []) as PickerCatalog["groups"], resources: (resources.data ?? []) as PickerCatalog["resources"] };
}

/** Whether an onboarding process already produced an access request (so sending twice asks once). */
export async function hasProcessRequest(db: Db, onboardingProcessId: string): Promise<boolean> {
  const { data, error } = await db
    .from("system_access_requests")
    .select("id")
    .eq("onboarding_process_id", onboardingProcessId)
    .limit(1);
  fail(error);
  return (data ?? []).length > 0;
}

type FunctionsDb = Pick<SupabaseClient, "functions">;

/**
 * Open a Tiful360 user for the employee through manage-users (the same invite the employees
 * screen sends). An existing account counts as opened. Returns the address the invite went to.
 */
export async function inviteToTiful360(
  db: FunctionsDb,
  companyId: string,
  employee: { id: string; email: string | null; full_name: string },
): Promise<string> {
  const email = employee.email?.trim();
  if (!email) throw new Error("לעובד אין כתובת מייל בכרטיס, ולכן אי אפשר לפתוח לו משתמש");
  const { data, error } = await db.functions.invoke("manage-users?action=invite", {
    body: { company_id: companyId, employees: [{ employee_id: employee.id, email, full_name: employee.full_name }] },
  });
  fail(error);
  const result = (data as { results?: Array<{ status: string; error?: string }> } | null)?.results?.[0];
  if (!result || (result.status !== "invited" && result.status !== "already_exists")) {
    throw new Error(result?.error || "פתיחת המשתמש נכשלה");
  }
  return email;
}

/** Revoke some (or, without ids, all) of an employee's access through the hub. */
export async function requestRevocation(db: Db, employeeId: string, grantIds: string[] | null, note?: string | null) {
  const { data, error } = await db.rpc("request_system_access_revocation", {
    _employee_id: employeeId,
    _grant_ids: grantIds && grantIds.length ? grantIds : null,
    _note: note?.trim() || null,
  });
  fail(error);
  return data as { requestId: string; ticketId: string; ticketCode: string; count: number };
}

/** Access the company's employees hold, including access waiting to be revoked. */
export async function listHeldGrants(db: Db, companyId: string): Promise<Array<AccessGrant & { employees: { full_name: string; department: string | null; status: string } | null }>> {
  const { data, error } = await db
    .from("system_access_grants")
    .select(`${GRANT_SELECT}, employees(full_name, department, status)`)
    .eq("company_id", companyId)
    .in("status", ["active", "revoke_requested", "revoke_dispatched"])
    .order("effective_from");
  fail(error);
  return (data ?? []) as Array<AccessGrant & { employees: { full_name: string; department: string | null; status: string } | null }>;
}

/** Every grant of one employee, past and present, with the requests behind them (for the protocol). */
export async function listEmployeeGrantHistory(db: Db, employeeId: string): Promise<AccessGrant[]> {
  const { data, error } = await db
    .from("system_access_grants")
    .select(GRANT_SELECT)
    .eq("employee_id", employeeId)
    .order("effective_from");
  fail(error);
  return (data ?? []) as AccessGrant[];
}

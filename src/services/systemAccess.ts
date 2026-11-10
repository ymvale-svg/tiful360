// Data access for the system access catalog. Functions take the client as a parameter so they
// can be tested with a fake. company_id of resources and groups is set by DB triggers.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccessGroup, AccessResource, AccessSystem } from "@/domain/systemAccess/types";
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

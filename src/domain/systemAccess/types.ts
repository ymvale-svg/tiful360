// Rows of the system access catalog (supabase/migrations/20261110220000_system_access_catalog.sql).
import type { AccessLevel } from "@/domain/systemAccess/protocol";

export type Provisioning = "manual" | "auto_tiful360" | "auto_mesimon";

export const PROVISIONING_LABEL: Record<Provisioning, string> = {
  manual: "ידני",
  auto_tiful360: "אוטומטי · תפעול 360",
  auto_mesimon: "אוטומטי · משימון",
};

export interface AccessSystem {
  id: string;
  company_id: string;
  name: string;
  provisioning: Provisioning;
  owner_role: string;
  owner_user_id: string | null;
  resource_label: string;
  is_active: boolean;
  sort_order: number;
}

export interface AccessResource {
  id: string;
  system_id: string;
  parent_id: string | null;
  name: string;
  path: string;
  external_ref: string | null;
  is_active: boolean;
  missing_since: string | null;
  sort_order: number;
}

export interface AccessGroup {
  id: string;
  system_id: string;
  name: string;
  external_name: string | null;
  description: string | null;
  is_active: boolean;
  system_access_group_resources: Array<{ resource_id: string; level: AccessLevel }>;
}

/** Systems most companies start with; the user picks which to add. */
export const SUGGESTED_SYSTEMS: Array<Pick<AccessSystem, "name" | "provisioning" | "owner_role" | "resource_label">> = [
  { name: "תפעול 360", provisioning: "auto_tiful360", owner_role: "admin", resource_label: "קבוצת הרשאה" },
  { name: "משימון", provisioning: "auto_mesimon", owner_role: "admin", resource_label: "מחלקה" },
  { name: "פריוריטי", provisioning: "manual", owner_role: "admin", resource_label: "סביבה" },
  { name: "ויפלנס", provisioning: "manual", owner_role: "admin", resource_label: "פרויקט" },
  { name: "סמנטו", provisioning: "manual", owner_role: "admin", resource_label: "פרויקט" },
  { name: "כונן P", provisioning: "manual", owner_role: "it_manager", resource_label: "תיקייה" },
];

export type GrantStatus =
  | "requested" | "dispatched" | "active" | "rejected"
  | "revoke_requested" | "revoke_dispatched" | "revoked";

export const GRANT_STATUS_LABEL: Record<GrantStatus, string> = {
  requested: "ממתין",
  dispatched: "נשלח לאחראי",
  active: "נפתח",
  rejected: "נדחה",
  revoke_requested: "ממתין לניתוק",
  revoke_dispatched: "נשלח לאחראי לניתוק",
  revoked: "נותק",
};

/** Statuses in which the employee holds the access (a pending revocation still counts). */
export const HELD_STATUSES: GrantStatus[] = ["active", "revoke_requested", "revoke_dispatched"];

/** What a request asks for: a system, optionally one access group or one resource, and from when. */
export interface AccessPick {
  system_id: string;
  group_id?: string | null;
  resource_id?: string | null;
  /** ISO timestamp; omitted = the employee's first day at 08:00 (set by the DB). */
  effective_from?: string | null;
}

export interface AccessGrant {
  id: string;
  company_id: string;
  request_id: string;
  employee_id: string;
  system_id: string;
  group_id: string | null;
  resource_id: string | null;
  status: GrantStatus;
  effective_from: string;
  executed_at: string | null;
  executed_by_name: string | null;
  external_username: string | null;
  dispatch_ticket_id: string | null;
  rejection_reason: string | null;
  note: string | null;
  created_at: string;
  revoke_request_id?: string | null;
  revoke_due_at?: string | null;
  revoke_dispatch_ticket_id?: string | null;
  revoked_at?: string | null;
  revoked_by_name?: string | null;
  revoke_note?: string | null;
  system_access_systems?: Pick<AccessSystem, "name" | "owner_role" | "owner_user_id" | "provisioning"> | null;
  system_access_groups?: Pick<AccessGroup, "name" | "external_name"> | null;
  system_access_resources?: Pick<AccessResource, "path"> | null;
}

export interface AccessRequest {
  id: string;
  company_id: string;
  employee_id: string;
  kind: "grant" | "revoke";
  status: "open" | "done";
  requested_by_name: string;
  requested_at: string;
  note: string | null;
  onboarding_process_id: string | null;
  hub_ticket_id: string | null;
  completed_at: string | null;
  employees?: { full_name: string; employee_code: string | null; role: string | null; department: string | null; start_date: string | null; email: string | null } | null;
  system_access_grants: AccessGrant[];
}

/** "כונן P · הנדסה (GRP_P_Engineering)" */
export function grantLabel(g: AccessGrant): string {
  const system = g.system_access_systems?.name ?? "מערכת";
  if (g.system_access_groups) {
    const ext = g.system_access_groups.external_name ? ` (${g.system_access_groups.external_name})` : "";
    return `${system} · ${g.system_access_groups.name}${ext}`;
  }
  if (g.system_access_resources) return `${system} · ${g.system_access_resources.path}`;
  return system;
}

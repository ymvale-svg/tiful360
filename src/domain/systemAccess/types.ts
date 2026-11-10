// Rows of the system access catalog (supabase/migrations/20261110110000_system_access_catalog.sql).
import type { AccessLevel } from "@/domain/systemAccess/protocol";

export type Provisioning = "manual" | "auto_tiful360" | "auto_mesimon";

export const PROVISIONING_LABEL: Record<Provisioning, string> = {
  manual: "ידני",
  auto_tiful360: "אוטומטי · תפעול 360",
  auto_mesimon: "אוטומטי · מסימון",
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
  { name: "מסימון", provisioning: "auto_mesimon", owner_role: "admin", resource_label: "מחלקה" },
  { name: "פריוריטי", provisioning: "manual", owner_role: "admin", resource_label: "סביבה" },
  { name: "ויפלנס", provisioning: "manual", owner_role: "admin", resource_label: "פרויקט" },
  { name: "סמנטו", provisioning: "manual", owner_role: "admin", resource_label: "פרויקט" },
  { name: "כונן P", provisioning: "manual", owner_role: "it_manager", resource_label: "תיקייה" },
];

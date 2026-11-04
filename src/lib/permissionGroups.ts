import type { AppRole } from "@/hooks/useAuth";

/** A company-scoped permission group. Default groups have a system_key (the role they represent). */
export interface PermissionGroup {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  roles: AppRole[];
  system_key: AppRole | null;
  created_at: string;
}

export interface PermissionGroupMember {
  id: string;
  group_id: string;
  user_id: string;
  company_id: string;
  created_at: string;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "סופר אדמין",
  admin: "מנהל מערכת",
  ceo: 'מנכ"ל',
  it_manager: "מנהל IT",
  operations: "תפעול",
  secretariat: "מזכירות",
  direct_manager: "מנהל ישיר",
  hr: "משאבי אנוש",
  payroll: "שכר",
  finance: "כספים",
  legal: "משפטי",
  employee: "עובד",
};

/** What each grantable permission opens, shown next to the checkbox in the group editor. */
export const ROLE_DESCRIPTIONS: Partial<Record<AppRole, string>> = {
  admin: "ניהול מלא: הגדרות, משתמשים, קבוצות וכל המסכים",
  hr: "עובדים, קליטה, בקשות, נוכחות ושכר",
  payroll: "שכר, תלושים, נוכחות ואישור בקשות",
  operations: "עובדים, ציוד, קטגוריות, קליטה והודעות לעובדים",
  it_manager: "ציוד והרשאות דיגיטליות, קריאות שירות וקליטה",
  finance: "עובדים, ציוד, רכב ומנויים",
  legal: "ציוד, מסמכים וקטגוריות",
  direct_manager: "אישור בקשות ונוכחות של הכפופים בלבד",
  ceo: "קריאות שירות והודעות לעובדים",
  secretariat: "קריאות שירות והודעות לעובדים",
};

/** Permissions a group can grant (platform and portal roles are not group-managed). */
export const GRANTABLE_ROLES: AppRole[] = [
  "admin", "hr", "payroll", "operations", "it_manager", "finance", "legal", "direct_manager", "ceo", "secretariat",
];

/**
 * Permissions a non-super-admin may put in a custom group or hand out through membership.
 * Mirrors public.admin_assignable_roles() and ADMIN_ASSIGNABLE_ROLES in manage-users.
 */
export const ADMIN_ASSIGNABLE_ROLES: readonly AppRole[] = ["operations", "direct_manager", "finance", "legal"];

/** Whether the caller may add/remove members of (or edit) a group with these permissions. */
export function canGrantRoles(roles: readonly AppRole[], isSuperAdmin: boolean): boolean {
  return isSuperAdmin || roles.every((r) => ADMIN_ASSIGNABLE_ROLES.includes(r));
}

/** The roles a user holds in one company: their group roles there plus platform/portal roles. */
export function rolesForCompany(
  globalRoles: readonly AppRole[],
  memberships: readonly { company_id: string; roles: readonly AppRole[] }[],
  companyId: string,
): AppRole[] {
  const platform = globalRoles.filter((r) => r === "super_admin" || r === "employee");
  const scoped = memberships.filter((m) => m.company_id === companyId).flatMap((m) => m.roles);
  return Array.from(new Set([...platform, ...scoped]));
}

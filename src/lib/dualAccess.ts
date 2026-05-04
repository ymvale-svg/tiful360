import type { AppRole } from "@/hooks/useAuth";

const OPS_ROLES: AppRole[] = [
  "admin",
  "super_admin",
  "it_manager",
  "operations",
  "direct_manager",
  "payroll",
];

/**
 * True when the user has BOTH the employee role and at least one
 * operations-side role — meaning they should pick which experience to enter.
 */
export function hasDualAccess(roles: AppRole[]): boolean {
  if (!roles || roles.length === 0) return false;
  const hasEmployee = roles.includes("employee");
  const hasOps = roles.some((r) => OPS_ROLES.includes(r));
  return hasEmployee && hasOps;
}

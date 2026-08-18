import { DOMAIN_META, type DomainKey, DOMAIN_ORDER } from "./assetDomains";

export type AppRole =
  | "admin"
  | "it_manager"
  | "employee"
  | "super_admin"
  | "direct_manager"
  | "payroll"
  | "operations"
  | "finance"
  | "legal"
  | "hr";

export const OWNER_ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "it_manager", label: "IT" },
  { value: "operations", label: "תפעול" },
  { value: "hr", label: "משאבי אנוש" },
  { value: "payroll", label: "חשבות שכר" },
  { value: "finance", label: "כספים" },
  { value: "legal", label: "משפטי" },
];

export const OWNER_ROLE_LABEL: Record<string, string> = {
  it_manager: "IT",
  operations: "תפעול",
  hr: "משאבי אנוש",
  payroll: "חשבות שכר",
  finance: "כספים",
  legal: "משפטי",
  admin: "מנהל",
  employee: "עובד",
  super_admin: "סופר אדמין",
  direct_manager: "מנהל ישיר",
};

export function resolveOwnerRole(
  group: { default_owner_role?: string | null } | null | undefined,
  category: { default_owner_role?: string | null; domain?: string | null } | null | undefined,
  fallback: string = "operations"
): string {
  if (group?.default_owner_role) return group.default_owner_role;
  if (category?.default_owner_role) return category.default_owner_role;
  return fallback;
}

export type DomainLabels = Partial<
  Record<DomainKey, { title?: string; hint?: string }>
>;

export function getDomainLabel(
  key: DomainKey,
  domainLabels?: DomainLabels | null
): { title: string; hint: string } {
  const custom = domainLabels?.[key];
  const meta = DOMAIN_META[key];
  return {
    title: custom?.title?.trim() || meta.title,
    hint: custom?.hint?.trim() || meta.hint,
  };
}

export function getAllDomainLabels(
  domainLabels?: DomainLabels | null
): Record<DomainKey, { title: string; hint: string }> {
  const out = {} as Record<DomainKey, { title: string; hint: string }>;
  for (const key of DOMAIN_ORDER) {
    out[key] = getDomainLabel(key, domainLabels);
  }
  return out;
}

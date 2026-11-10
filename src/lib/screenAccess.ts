/**
 * Single source of truth for which roles may open each screen and each tab.
 * Routes (App.tsx), the sidebar, global search, hub tab bars and ProtectedRoute all read
 * these lists, so a screen can never be reachable from one place and blocked in another.
 *
 * Super-admin bypass: super_admin passes every list unless the entry is `strict`.
 */
export type AppRole =
  | "admin" | "it_manager" | "employee" | "super_admin" | "direct_manager" | "payroll"
  | "hr" | "operations" | "finance" | "legal" | "secretariat" | "ceo";

export type RoleList = readonly AppRole[];

/** Listed roles, with a super-admin bypass unless strict. No list means everyone. */
export function canAccess(
  roles: readonly string[],
  isSuperAdmin: boolean,
  list?: RoleList,
  strict = false,
): boolean {
  if (!list) return true;
  if (strict) return list.some((r) => roles.includes(r));
  if (isSuperAdmin || roles.includes("super_admin")) return true;
  return list.some((r) => roles.includes(r));
}

export interface HubTab {
  key: string;
  label: string;
  roles: RoleList;
  strict?: boolean;
}

const ALL_OPS: RoleList = ["admin", "it_manager", "super_admin", "operations", "direct_manager", "payroll", "hr", "finance", "legal", "secretariat", "ceo"];
const ATTENDANCE_STAFF: RoleList = ["admin", "super_admin", "direct_manager", "payroll", "hr"];
const ASSET_STAFF: RoleList = ["admin", "it_manager", "super_admin", "operations", "finance", "legal"];
const ADMINS: RoleList = ["admin", "super_admin"];
/** Who defines systems, environments, folder trees and access groups. */
const ACCESS_CATALOG_MANAGERS: RoleList = ["admin", "super_admin", "it_manager"];
/** Who requests access (HR, operations) or works the requests (admins, IT). */
const ACCESS_REQUEST_ROLES: RoleList = ["admin", "super_admin", "it_manager", "hr", "operations"];
export const ANNOUNCEMENT_ROLES: RoleList = ["admin", "super_admin", "ceo", "operations", "secretariat", "hr"];

/** Tabs of every hub screen, in display order. The first tab the user may open is the default. */
export const HUB_TABS = {
  dashboard: [
    { key: "alerts", label: "התראות", roles: ["admin", "it_manager", "super_admin"] },
  ],
  employees: [
    { key: "employees", label: "עובדים", roles: ["admin", "super_admin", "operations", "payroll", "hr", "finance"] },
    { key: "onboarding", label: "קליטת עובדים", roles: ["admin", "super_admin", "operations", "it_manager", "hr"] },
    { key: "users", label: "משתמשים ותפקידים", roles: ["admin", "super_admin", "operations", "payroll", "hr"] },
  ],
  requests: [
    { key: "reports", label: "דוחות נוכחות וחוסרים", roles: ATTENDANCE_STAFF },
    { key: "leave", label: "בקשות חופשה", roles: ATTENDANCE_STAFF },
    { key: "corrections", label: "תיקוני נוכחות", roles: ATTENDANCE_STAFF },
    { key: "map", label: "מפת נוכחות", roles: ATTENDANCE_STAFF },
  ],
  assets: [
    { key: "assets", label: "משאבים", roles: ASSET_STAFF },
    { key: "handover", label: "ממתינים לשיוך", roles: ASSET_STAFF },
    { key: "subscriptions", label: "רכב ומנויים", roles: ["admin", "super_admin", "operations", "finance", "payroll"] },
    { key: "categories", label: "קטגוריות", roles: ["admin", "super_admin", "operations", "legal"] },
  ],
  settings: [
    { key: "general", label: "כללי", roles: ADMINS },
    { key: "sub_employers", label: "מעסיקים / תת-חברות", roles: ADMINS },
    // Announcements live inside portal management; their managers see only that section.
    { key: "portal", label: "פורטל עובדים", roles: ANNOUNCEMENT_ROLES },
    { key: "email_templates", label: "תבניות מייל", roles: ADMINS },
    { key: "protocols", label: "פרוטוקולי מסירה", roles: ADMINS },
    { key: "alerts", label: "חוקי התראות", roles: ADMINS },
    { key: "groups", label: "קבוצות והרשאות", roles: ADMINS },
    { key: "permission_audit", label: "לוג הרשאות", roles: ADMINS },
    { key: "companies", label: "ניהול חברות", roles: ["super_admin"], strict: true },
  ],
  systemAccess: [
    { key: "requests", label: "בקשות לטיפול", roles: ACCESS_REQUEST_ROLES },
    { key: "systems", label: "מערכות וסביבות", roles: ACCESS_CATALOG_MANAGERS },
    { key: "tree", label: "עץ וקבוצות גישה", roles: ACCESS_CATALOG_MANAGERS },
  ],
} as const satisfies Record<string, readonly HubTab[]>;

export type HubKey = keyof typeof HUB_TABS;

/** Route of each hub screen. */
export const HUB_PATHS: Record<HubKey, string> = {
  dashboard: "/",
  employees: "/employees",
  requests: "/requests",
  assets: "/assets",
  settings: "/settings",
  systemAccess: "/system-access",
};

function union(...lists: RoleList[]): AppRole[] {
  return [...new Set(lists.flat())];
}
const tabUnion = (hub: Exclude<HubKey, "dashboard">) => union(...HUB_TABS[hub].map((t) => t.roles as RoleList));

/** Roles per routed screen. A hub screen opens for anyone who may open one of its tabs. */
export const SCREEN_ROLES = {
  dashboard: ["admin", "it_manager", "super_admin", "operations", "payroll", "hr", "finance"] as RoleList,
  employees: tabUnion("employees"),
  employeeDetail: ["admin", "super_admin", "operations", "direct_manager", "payroll", "hr", "finance"] as RoleList,
  requests: tabUnion("requests"),
  payroll: ["admin", "super_admin", "payroll", "hr"] as RoleList,
  assets: tabUnion("assets"),
  assetDomain: ASSET_STAFF,
  tickets: ALL_OPS,
  settings: tabUnion("settings"),
  systemAccess: tabUnion("systemAccess"),
} as const;

/** Role list of one hub tab. */
export function tabRoles(hub: HubKey, tab: string): RoleList {
  const found = (HUB_TABS[hub] as readonly HubTab[]).find((t) => t.key === tab);
  if (!found) throw new Error(`Unknown tab ${hub}/${tab}`);
  return found.roles;
}

/** Allowed tabs of a hub for these roles, in order. */
export function allowedTabs(hub: HubKey, roles: readonly string[], isSuperAdmin: boolean): HubTab[] {
  return (HUB_TABS[hub] as readonly HubTab[]).filter((t) => canAccess(roles, isSuperAdmin, t.roles, t.strict));
}

/** The requested tab when allowed, otherwise the first allowed tab (or null when none). */
export function resolveTab(tabs: readonly HubTab[], requested: string | null): string | null {
  if (requested && tabs.some((t) => t.key === requested)) return requested;
  return tabs[0]?.key ?? null;
}

export interface LegacyRedirect {
  from: string;
  to: string;
  tab?: string;
  hash?: string;
}

/**
 * Screens that were merged into hubs. Old URLs (bookmarks, email links) keep working: the
 * route redirects to the hub and tab, keeping the original query string.
 */
export const LEGACY_REDIRECTS: readonly LegacyRedirect[] = [
  { from: "/alerts", to: "/", hash: "alerts" },
  { from: "/onboarding", to: "/employees", tab: "onboarding" },
  { from: "/user-management", to: "/employees", tab: "users" },
  { from: "/leave-requests", to: "/requests", tab: "leave" },
  { from: "/attendance-corrections", to: "/requests", tab: "corrections" },
  { from: "/attendance-map", to: "/requests", tab: "map" },
  { from: "/assets-handover", to: "/assets", tab: "handover" },
  { from: "/assets-subscriptions", to: "/assets", tab: "subscriptions" },
  { from: "/categories", to: "/assets", tab: "categories" },
  { from: "/announcements", to: "/settings", tab: "portal" },
  { from: "/companies", to: "/settings", tab: "companies" },
];

export const LEGACY_BY_PATH: Record<string, LegacyRedirect> = Object.fromEntries(
  LEGACY_REDIRECTS.map((r) => [r.from, r]),
);

/** Target URL of a legacy redirect, merging the current query string. */
export function legacyTarget(r: LegacyRedirect, search = ""): string {
  const params = new URLSearchParams(search);
  if (r.tab) params.set("tab", r.tab);
  const qs = params.toString();
  return `${r.to}${qs ? `?${qs}` : ""}${r.hash ? `#${r.hash}` : ""}`;
}

/** Link to a hub tab. */
export function hubPath(path: string, tab?: string): string {
  return tab ? `${path}?tab=${tab}` : path;
}

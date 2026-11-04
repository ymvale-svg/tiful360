import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  HUB_TABS, LEGACY_REDIRECTS, SCREEN_ROLES, allowedTabs, canAccess, legacyTarget, resolveTab,
} from "@/lib/screenAccess";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const { navGroups, canSeeNavItem } = await import("@/components/AppSidebar");

const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
/** Static in-app screens: routes inside the app layout, minus detail pages. */
const screens = [...app.matchAll(/<Route path="(\/[^"]*)" element=\{<ProtectedRoute requiredRoles=\{SCREEN_ROLES\.(\w+)\}/g)]
  .map((m) => ({ path: m[1], key: m[2] as keyof typeof SCREEN_ROLES }))
  .filter((s) => !s.path.includes(":"));
const items = navGroups.flatMap((g) => g.items);
const menuPaths = items.map((i) => i.path);

describe("navigation map", () => {
  it("has a compact sidebar of hub screens", () => {
    expect(items.length).toBeLessThanOrEqual(8);
  });

  it("reaches every screen from the sidebar", () => {
    expect(screens.length).toBeGreaterThanOrEqual(6);
    expect(screens.filter((s) => !menuPaths.includes(s.path)).map((s) => s.path)).toEqual([]);
  });

  it("uses the same role list as each route", () => {
    for (const s of screens) {
      const item = items.find((i) => i.path === s.path)!;
      expect([...(item.roles ?? [])].sort(), s.path).toEqual([...SCREEN_ROLES[s.key]].sort());
    }
  });

  it("opens a hub for exactly the roles that may open one of its tabs", () => {
    for (const hub of ["employees", "requests", "assets", "settings"] as const) {
      const tabRoles = new Set(HUB_TABS[hub].flatMap((t) => [...t.roles]));
      expect([...SCREEN_ROLES[hub]].sort(), hub).toEqual([...tabRoles].sort());
    }
  });

  it("hides items by role, with the super-admin bypass except for strict items", () => {
    const payroll = items.find((i) => i.path === "/payroll")!;
    expect(canSeeNavItem(payroll, ["hr"], false)).toBe(true);
    expect(canSeeNavItem(payroll, ["it_manager"], false)).toBe(false);
    expect(canSeeNavItem(payroll, ["it_manager"], true)).toBe(true);
    expect(canAccess(["super_admin"], true, ["super_admin"], true)).toBe(true);
    expect(canAccess(["admin"], false, ["super_admin"], true)).toBe(false);
  });

  it("keeps each merged screen behind its former role list", () => {
    // Companies is strict: an admin never sees it, a super admin does.
    expect(allowedTabs("settings", ["admin"], false).map((t) => t.key)).not.toContain("companies");
    expect(allowedTabs("settings", ["super_admin"], true).map((t) => t.key)).toContain("companies");
    // Announcement managers reach only the portal tab of settings.
    expect(allowedTabs("settings", ["secretariat"], false).map((t) => t.key)).toEqual(["portal"]);
    // Payroll reaches assets only for vehicle subscriptions; IT gets onboarding but not the employee list.
    expect(allowedTabs("assets", ["payroll"], false).map((t) => t.key)).toEqual(["subscriptions"]);
    expect(allowedTabs("employees", ["it_manager"], false).map((t) => t.key)).toEqual(["onboarding"]);
    expect(allowedTabs("assets", ["finance"], false).map((t) => t.key)).not.toContain("categories");
  });

  it("falls back to the first allowed tab for unknown or forbidden tabs", () => {
    const tabs = allowedTabs("assets", ["payroll"], false);
    expect(resolveTab(tabs, "categories")).toBe("subscriptions");
    expect(resolveTab(tabs, null)).toBe("subscriptions");
    expect(resolveTab([], "x")).toBeNull();
  });
});

describe("legacy redirects", () => {
  const oldPaths = [
    "/alerts", "/onboarding", "/user-management", "/leave-requests", "/attendance-corrections",
    "/attendance-map", "/assets-handover", "/assets-subscriptions", "/categories", "/announcements", "/companies",
  ];

  it("redirects every merged screen's old URL", () => {
    expect(LEGACY_REDIRECTS.map((r) => r.from).sort()).toEqual([...oldPaths].sort());
    expect(app).toContain("LEGACY_REDIRECTS.map");
    for (const p of oldPaths) expect(app, p).not.toMatch(new RegExp(`path="${p}" element=\\{<ProtectedRoute`));
  });

  it("points each old URL at an existing hub tab and keeps the query string", () => {
    for (const r of LEGACY_REDIRECTS) {
      if (!r.tab) continue;
      const hub = (Object.entries({ "/employees": "employees", "/requests": "requests", "/assets": "assets", "/settings": "settings" }) as [string, keyof typeof HUB_TABS][])
        .find(([path]) => path === r.to)![1];
      expect(HUB_TABS[hub].map((t) => t.key), r.from).toContain(r.tab);
    }
    const leave = LEGACY_REDIRECTS.find((r) => r.from === "/leave-requests")!;
    expect(legacyTarget(leave, "?id=42")).toBe("/requests?id=42&tab=leave");
    expect(legacyTarget(LEGACY_REDIRECTS.find((r) => r.from === "/alerts")!, "")).toBe("/#alerts");
  });
});

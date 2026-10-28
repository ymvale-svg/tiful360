import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const { navGroups, canSeeNavItem } = await import("@/components/AppSidebar");

const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
/** Static in-app screens: routes inside the app layout, minus detail pages and redirects. */
const screens = [...app.matchAll(/<Route path="(\/[^"]*)" element=\{<ProtectedRoute/g)]
  .map((m) => m[1])
  .filter((p) => !p.includes(":") && !["/select-experience"].includes(p));
const menuPaths = navGroups.flatMap((g) => g.items.map((i) => i.path));

describe("navigation map", () => {
  it("reaches every screen from the sidebar", () => {
    expect(screens.length).toBeGreaterThan(10);
    expect(screens.filter((p) => !menuPaths.includes(p))).toEqual([]);
  });

  it("uses the same role list as each route", () => {
    for (const item of navGroups.flatMap((g) => g.items)) {
      const m = app.match(new RegExp(`path="${item.path.replace(/[/-]/g, "\\$&")}" element=\\{<ProtectedRoute requiredRoles=\\{(\\[[^\\]]*\\])`));
      if (!m || !item.roles) continue;
      expect([...item.roles].sort(), item.path).toEqual(JSON.parse(m[1]).sort());
    }
  });

  it("hides items by role, with the super-admin bypass except for strict items", () => {
    const companies = navGroups.flatMap((g) => g.items).find((i) => i.path === "/companies")!;
    const payroll = navGroups.flatMap((g) => g.items).find((i) => i.path === "/payroll")!;
    expect(canSeeNavItem(payroll, ["hr"], false)).toBe(true);
    expect(canSeeNavItem(payroll, ["it_manager"], false)).toBe(false);
    expect(canSeeNavItem(payroll, ["it_manager"], true)).toBe(true);
    expect(canSeeNavItem(companies, ["admin"], false)).toBe(false);
  });
});

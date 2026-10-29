import { describe, expect, it } from "vitest";
import { assetWarnings, buildLauncherItems, filterLauncherItems, launcherCategories, normalizeAppUrl, type AccessAsset, type CatalogLink } from "@/lib/portalApps";

const NOW = new Date(2026, 9, 29, 10, 0);
const day = (offset: number) => new Date(2026, 9, 29 + offset, 12).toISOString();

const ERP_CAT = "11111111-1111-1111-1111-111111111111";
const LIC_CAT = "22222222-2222-2222-2222-222222222222";
const BI_GROUP = "33333333-3333-3333-3333-333333333333";

const link = (over: Partial<CatalogLink>): CatalogLink => ({ id: "l1", label: "דואר", url: "https://mail.company.co.il", access_mode: "everyone", sort_order: 0, ...over });
const asset = (over: Partial<AccessAsset>): AccessAsset => ({ id: "a1", asset_name: "ERP", category_id: ERP_CAT, group_id: null, status: "in_use", ...over });

describe("normalizeAppUrl", () => {
  it("keeps http(s) links and adds https to a bare host", () => {
    expect(normalizeAppUrl("https://erp.company.co.il/login")).toBe("https://erp.company.co.il/login");
    expect(normalizeAppUrl("erp.company.co.il")).toBe("https://erp.company.co.il/");
  });
  it("rejects scripts, data and other schemes", () => {
    expect(normalizeAppUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeAppUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(normalizeAppUrl("data:text/html,hi")).toBeNull();
    expect(normalizeAppUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeAppUrl("")).toBeNull();
    expect(normalizeAppUrl("not a url")).toBeNull();
  });
});

describe("buildLauncherItems", () => {
  it("shows company-wide systems to everyone", () => {
    expect(buildLauncherItems([link({})], [], NOW).map((i) => i.key)).toEqual(["link:l1"]);
  });

  it("shows an assigned system only to holders of an asset in its category", () => {
    const erp = link({ id: "l2", label: "ERP", access_mode: "assigned", asset_category_id: ERP_CAT });
    expect(buildLauncherItems([erp], [], NOW)).toEqual([]);
    expect(buildLauncherItems([erp], [asset({ category_id: LIC_CAT })], NOW)).toEqual([]);
    expect(buildLauncherItems([erp], [asset({ account_username: "israel.c" })], NOW)).toMatchObject([{ key: "link:l2", username: "israel.c" }]);
  });

  it("matches a sub-category when the system names one", () => {
    const bi = link({ id: "l3", label: "BI", access_mode: "assigned", asset_category_id: LIC_CAT, asset_group_id: BI_GROUP });
    expect(buildLauncherItems([bi], [asset({ category_id: LIC_CAT, group_id: null })], NOW)).toEqual([]);
    expect(buildLauncherItems([bi], [asset({ category_id: LIC_CAT, group_id: BI_GROUP })], NOW)).toHaveLength(1);
  });

  it("ignores access that was returned or switched off", () => {
    const erp = link({ id: "l2", access_mode: "assigned", asset_category_id: ERP_CAT });
    for (const status of ["in_stock", "inactive", "lost"]) {
      expect(buildLauncherItems([erp], [asset({ status })], NOW)).toEqual([]);
    }
  });

  it("gives held assets with a login URL their own tile unless a catalogue system covers them", () => {
    const own = asset({ id: "a9", asset_name: "Jira", account_url: "jira.company.co.il", category_name: "תפעול" });
    expect(buildLauncherItems([], [own], NOW)).toMatchObject([{ key: "asset:a9", name: "Jira", url: "https://jira.company.co.il/", category: "תפעול" }]);
    const covering = link({ id: "l2", access_mode: "assigned", asset_category_id: ERP_CAT });
    expect(buildLauncherItems([covering], [own], NOW).map((i) => i.key)).toEqual(["link:l2"]);
    expect(buildLauncherItems([], [asset({ account_url: null })], NOW)).toEqual([]);
  });

  it("drops entries whose URL is unsafe and keeps catalogue order", () => {
    const items = buildLauncherItems([
      link({ id: "b", label: "ב", sort_order: 2 }),
      link({ id: "x", label: "רע", url: "javascript:alert(1)", sort_order: 0 }),
      link({ id: "a", label: "א", sort_order: 1 }),
    ], [], NOW);
    expect(items.map((i) => i.key)).toEqual(["link:a", "link:b"]);
  });
});

describe("assetWarnings", () => {
  it("warns before expiry and marks expired access as critical, most urgent first", () => {
    expect(assetWarnings([asset({ password_expires_at: day(5) })], NOW)).toEqual([{ level: "warning", text: "הסיסמה תפוג בעוד 5 ימים" }]);
    expect(assetWarnings([asset({ password_expires_at: day(1) })], NOW)[0].text).toBe("הסיסמה תפוג בעוד יום");
    expect(assetWarnings([asset({ license_expires_at: day(0) })], NOW)).toEqual([{ level: "critical", text: "הרישיון יפוג היום" }]);
    expect(assetWarnings([asset({ password_expires_at: day(3), license_expires_at: day(-2) })], NOW).map((w) => w.level)).toEqual(["critical", "warning"]);
  });
  it("stays quiet when expiry is far away or unknown", () => {
    expect(assetWarnings([asset({ password_expires_at: day(60), license_expires_at: null })], NOW)).toEqual([]);
    expect(assetWarnings([asset({ license_expires_at: "not a date" })], NOW)).toEqual([]);
  });
});

describe("filterLauncherItems", () => {
  const items = buildLauncherItems([
    link({ id: "l1", label: "דואר ויומן", category: "תקשורת" }),
    link({ id: "l2", label: "ERP כספים", category: "כספים", description: "הנהלת חשבונות" }),
  ], [], NOW);
  it("searches name, category and description, every term must match", () => {
    expect(filterLauncherItems(items, "erp", null).map((i) => i.name)).toEqual(["ERP כספים"]);
    expect(filterLauncherItems(items, "חשבונות", null)).toHaveLength(1);
    expect(filterLauncherItems(items, "דואר כספים", null)).toEqual([]);
  });
  it("filters by category and lists categories once, sorted", () => {
    expect(filterLauncherItems(items, "", "תקשורת").map((i) => i.name)).toEqual(["דואר ויומן"]);
    expect(launcherCategories(items)).toEqual(["כספים", "תקשורת"]);
  });
});

describe("expiry dates stored as plain dates", () => {
  it("counts calendar days, not hours", () => {
    expect(assetWarnings([asset({ password_expires_at: "2026-11-03" })], NOW)[0].text).toBe("הסיסמה תפוג בעוד 5 ימים");
    expect(assetWarnings([asset({ license_expires_at: "2026-10-29" })], NOW)[0].text).toBe("הרישיון יפוג היום");
    expect(assetWarnings([asset({ license_expires_at: "2026-10-28" })], NOW)[0]).toEqual({ level: "critical", text: "הרישיון פג" });
  });
});

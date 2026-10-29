/**
 * Employee app launcher ("המערכות שלי").
 *
 * Systems come from the company catalogue (portal_links) and from the employee's own digital /
 * licence assets. A catalogue entry with access_mode "assigned" is shown only to employees who hold
 * an asset of its category (or sub-category); assigned assets that no entry covers but carry a login
 * URL get a tile of their own. The launcher only links out: access is enforced by each system.
 */

export type LauncherWarningLevel = "warning" | "critical";

export interface LauncherWarning {
  level: LauncherWarningLevel;
  text: string;
}

export interface LauncherItem {
  /** "link:<id>" or "asset:<id>"; also the favourites key. */
  key: string;
  name: string;
  url: string;
  category: string | null;
  description: string | null;
  username: string | null;
  warnings: LauncherWarning[];
}

export interface CatalogLink {
  id: string;
  label: string;
  url: string;
  category?: string | null;
  description?: string | null;
  access_mode?: string | null;
  asset_category_id?: string | null;
  asset_group_id?: string | null;
  sort_order?: number | null;
}

export interface AccessAsset {
  id: string;
  asset_name: string;
  category_id: string;
  group_id: string | null;
  status?: string | null;
  account_url?: string | null;
  account_username?: string | null;
  password_expires_at?: string | null;
  license_expires_at?: string | null;
  category_name?: string | null;
}

/** Asset categories whose assets are system access (shown as launcher tiles). */
export const ACCESS_DOMAINS = ["digital", "licenses"] as const;

/** Statuses that mean the employee no longer holds the access. */
const INACTIVE_STATUSES = new Set(["in_stock", "inactive", "lost"]);

const PASSWORD_WARN_DAYS = 14;
const LICENSE_WARN_DAYS = 30;

/**
 * An http(s) URL safe to open, or null. A bare host ("erp.company.co.il") gets https://;
 * any other scheme (javascript:, data:, file:) is rejected.
 */
export function normalizeAppUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname || (!url.hostname.includes(".") && url.hostname !== "localhost")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Calendar days from today to the date (0 = today). A plain "YYYY-MM-DD" is read as a local date. */
function daysUntil(date: string | null | undefined, now: Date): number | null {
  if (!date) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const target = ymd ? new Date(+ymd[1], +ymd[2] - 1, +ymd[3]) : new Date(date);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((startOfDay(target) - startOfDay(now)) / 86400000);
}

function expiryWarning(kind: "password" | "license", days: number | null): LauncherWarning | null {
  if (days === null) return null;
  const [limit, expired, expires] = kind === "password"
    ? [PASSWORD_WARN_DAYS, "הסיסמה פגה", "הסיסמה תפוג"]
    : [LICENSE_WARN_DAYS, "הרישיון פג", "הרישיון יפוג"];
  if (days < 0) return { level: "critical", text: expired };
  if (days === 0) return { level: "critical", text: `${expires} היום` };
  if (days <= limit) return { level: "warning", text: `${expires} בעוד ${days === 1 ? "יום" : `${days} ימים`}` };
  return null;
}

/** Expiry warnings for the assets behind one tile, most urgent first, without duplicates. */
export function assetWarnings(assets: AccessAsset[], now = new Date()): LauncherWarning[] {
  const out: LauncherWarning[] = [];
  for (const a of assets) {
    for (const w of [
      expiryWarning("password", daysUntil(a.password_expires_at, now)),
      expiryWarning("license", daysUntil(a.license_expires_at, now)),
    ]) {
      if (w && !out.some((o) => o.text === w.text)) out.push(w);
    }
  }
  return out.sort((x, y) => (x.level === y.level ? 0 : x.level === "critical" ? -1 : 1));
}

function linkCovers(link: CatalogLink, asset: AccessAsset): boolean {
  if (link.asset_group_id) return asset.group_id === link.asset_group_id;
  return !!link.asset_category_id && asset.category_id === link.asset_category_id;
}

/** The tiles one employee sees, in catalogue order, then their own unlisted systems by name. */
export function buildLauncherItems(links: CatalogLink[], assets: AccessAsset[], now = new Date()): LauncherItem[] {
  const held = assets.filter((a) => !INACTIVE_STATUSES.has(a.status ?? ""));
  const covered = new Set<string>();
  const items: LauncherItem[] = [];

  const ordered = [...links].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const link of ordered) {
    const url = normalizeAppUrl(link.url);
    if (!url) continue;
    const assigned = link.access_mode === "assigned";
    const matching = assigned ? held.filter((a) => linkCovers(link, a)) : [];
    if (assigned && !matching.length) continue;
    matching.forEach((a) => covered.add(a.id));
    items.push({
      key: `link:${link.id}`,
      name: link.label,
      url,
      category: link.category?.trim() || null,
      description: link.description?.trim() || null,
      username: matching.find((a) => a.account_username)?.account_username ?? null,
      warnings: assetWarnings(matching, now),
    });
  }

  const own = held
    .filter((a) => !covered.has(a.id))
    .map((a) => ({ a, url: normalizeAppUrl(a.account_url) }))
    .filter((x): x is { a: AccessAsset; url: string } => !!x.url)
    .sort((x, y) => x.a.asset_name.localeCompare(y.a.asset_name, "he"));
  for (const { a, url } of own) {
    items.push({
      key: `asset:${a.id}`,
      name: a.asset_name,
      url,
      category: a.category_name?.trim() || null,
      description: null,
      username: a.account_username ?? null,
      warnings: assetWarnings([a], now),
    });
  }
  return items;
}

/** Search terms must all appear in the name, category or description (case-insensitive). */
export function filterLauncherItems(items: LauncherItem[], query: string, category: string | null): LauncherItem[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (category && item.category !== category) return false;
    if (!terms.length) return true;
    const hay = [item.name, item.category, item.description].filter(Boolean).join(" ").toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

export function launcherCategories(items: LauncherItem[]): string[] {
  return [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "he"));
}

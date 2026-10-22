import type { ExpiringAsset } from "@/hooks/useExpiringAssets";
import { domainKeyToSlug, getDomain, type DomainKey } from "@/lib/assetDomains";

type Category = { id: string; domain?: string | null; prefix?: string; protocol_type?: string };
export interface ExpiringResourceTarget {
  key: string;
  href: string | null;
  item: ExpiringAsset;
  expiries: ExpiringAsset[];
}

export function getExpiringResourceTargets(items: ExpiringAsset[], categories: Category[]): ExpiringResourceTarget[] {
  const targets = new Map<string, ExpiringResourceTarget>();
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  for (const item of items) {
    let href: string | null = null;
    if (item.asset_id) {
      const category = item.category_id ? categoryMap.get(item.category_id) : undefined;
      const fallback: DomainKey = item.domain === "vehicle" ? "physical"
        : item.domain === "license" ? "licenses" : item.domain;
      const domain = category ? getDomain(category) : fallback;
      href = `/assets/${domainKeyToSlug(domain)}/${item.asset_id}`;
    } else if (item.source_type === "digital_access" && item.current_owner_id) {
      href = `/employees/${item.current_owner_id}?tab=assets`;
    }
    const key = item.asset_id ? `asset:${item.asset_id}` : `${item.source_type}:${item.source_id}`;
    const existing = targets.get(key);
    if (existing) existing.expiries.push(item);
    else targets.set(key, { key, href, item, expiries: [item] });
  }
  return [...targets.values()].sort((a, b) =>
    Math.min(...a.expiries.map((e) => e.days_left)) - Math.min(...b.expiries.map((e) => e.days_left)));
}

export function expiryClickAction(targets: ExpiringResourceTarget[]):
  { type: "navigate"; href: string } | { type: "list" } {
  const [only] = targets;
  return targets.length === 1 && only?.href ? { type: "navigate", href: only.href } : { type: "list" };
}
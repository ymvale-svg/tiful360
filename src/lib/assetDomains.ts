// Shared domain classification for the assets feature.
// Each asset_category maps to exactly one domain.

import {
  AppWindow,
  Building,
  GraduationCap,
  KeySquare,
  Monitor,
  ShieldCheck,
} from "lucide-react";

export type DomainKey =
  | "physical"
  | "digital"
  | "licenses"
  | "training"
  | "insurance"
  | "real-estate";

export const DOMAIN_ORDER: DomainKey[] = [
  "physical",
  "digital",
  "licenses",
  "training",
  "insurance",
  "real-estate",
];

export interface DomainMeta {
  key: DomainKey;
  title: string;
  icon: typeof AppWindow;
  /** Tailwind color tokens for icon bg / text / ring. */
  color: { bg: string; text: string; ring: string };
}

export const DOMAIN_META: Record<DomainKey, DomainMeta> = {
  physical: {
    key: "physical",
    title: "ציוד פיזי",
    icon: Monitor,
    color: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400", ring: "hover:ring-sky-500/30" },
  },
  digital: {
    key: "digital",
    title: "גישות דיגיטליות",
    icon: KeySquare,
    color: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", ring: "hover:ring-purple-500/30" },
  },
  licenses: {
    key: "licenses",
    title: "רישיונות ותוכנות",
    icon: AppWindow,
    color: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", ring: "hover:ring-violet-500/30" },
  },
  training: {
    key: "training",
    title: "הדרכות ותאימות",
    icon: GraduationCap,
    color: { bg: "bg-pink-500/10", text: "text-pink-600 dark:text-pink-400", ring: "hover:ring-pink-500/30" },
  },
  insurance: {
    key: "insurance",
    title: "ביטוחים ורגולציה",
    icon: ShieldCheck,
    color: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", ring: "hover:ring-emerald-500/30" },
  },
  "real-estate": {
    key: "real-estate",
    title: 'נדל"ן וחוזים',
    icon: Building,
    color: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", ring: "hover:ring-amber-500/30" },
  },
};

/** Classify a single category to its domain. Priority order — first match wins. */
export function classifyCategory(c: { prefix?: string; protocol_type?: string }): DomainKey {
  if (c.prefix === "VRT" || c.protocol_type === "digital" || c.prefix === "DACC") return "digital";
  if (c.prefix === "SFT" || c.prefix === "MAN") return "licenses";
  if (c.protocol_type === "real_estate" || c.prefix === "LEASE") return "real-estate";
  if (c.protocol_type === "insurance" || c.prefix === "CERT" || c.prefix === "CINS") return "insurance";
  if (c.protocol_type === "training" || c.prefix === "MAINT") return "training";
  return "physical";
}

/** Group categories into domains in a single pass. */
export function groupCategoriesByDomain<T extends { id: string; prefix?: string; protocol_type?: string }>(
  categories: T[],
): Record<DomainKey, T[]> {
  const out: Record<DomainKey, T[]> = {
    physical: [],
    digital: [],
    licenses: [],
    training: [],
    insurance: [],
    "real-estate": [],
  };
  for (const c of categories) out[classifyCategory(c)].push(c);
  return out;
}

export function isDomainKey(value: string | undefined): value is DomainKey {
  return !!value && (DOMAIN_ORDER as string[]).includes(value);
}

/** Domains where each row is unique — no parent grouping. */
const FLAT_DOMAINS: DomainKey[] = ["real-estate"];

/** Returns the group-by key for an asset within its sub-category, per domain.
 *  Returns null when the domain should be displayed flat (no parent grouping). */
export function getGroupKey(
  asset: { asset_name?: string | null; custom_fields?: any; license_plate?: string | null },
  domain: DomainKey,
  category?: { prefix?: string; protocol_type?: string } | null,
): string | null {
  if (FLAT_DOMAINS.includes(domain)) return null;
  // Vehicles: each car is unique
  if (domain === "physical" && category?.protocol_type === "vehicle") return null;
  // Insurance: group by coverage type from custom fields
  if (domain === "insurance") {
    const t = (asset.custom_fields?.["סוג כיסוי"] ?? "").toString().trim();
    return t || "ללא סוג כיסוי";
  }
  return (asset.asset_name ?? "ללא שם").trim() || "ללא שם";
}

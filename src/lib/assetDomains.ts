// Shared domain classification for the assets feature.
// 6 fixed domains. Categories carry a hard `domain` column on the DB.
// `classifyCategory` remains only as a fallback for legacy data.

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
  | "real_estate";

export const DOMAIN_ORDER: DomainKey[] = [
  "physical",
  "digital",
  "licenses",
  "training",
  "insurance",
  "real_estate",
];

export interface DomainMeta {
  key: DomainKey;
  title: string;
  /** Short description of what lives in this domain. */
  hint: string;
  icon: typeof AppWindow;
  /** Tailwind color tokens for icon bg / text / ring. */
  color: { bg: string; text: string; ring: string; soft: string };
}

export const DOMAIN_META: Record<DomainKey, DomainMeta> = {
  physical: {
    key: "physical",
    title: "ציוד פיזי",
    hint: "מחשבים, ציוד היקפי, רכב, ציוד עזר",
    icon: Monitor,
    color: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400", ring: "hover:ring-sky-500/30", soft: "bg-sky-500/5" },
  },
  digital: {
    key: "digital",
    title: "גישות דיגיטליות",
    hint: "חשבונות, מערכות, הרשאות, סיסמאות",
    icon: KeySquare,
    color: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", ring: "hover:ring-purple-500/30", soft: "bg-purple-500/5" },
  },
  licenses: {
    key: "licenses",
    title: "רישיונות ותוכנות",
    hint: "מנויים, רישיונות תוכנה, ספקים",
    icon: AppWindow,
    color: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", ring: "hover:ring-violet-500/30", soft: "bg-violet-500/5" },
  },
  training: {
    key: "training",
    title: "הדרכות ותאימות",
    hint: "הדרכות חובה, רענונים, תחזוקה תקופתית",
    icon: GraduationCap,
    color: { bg: "bg-pink-500/10", text: "text-pink-600 dark:text-pink-400", ring: "hover:ring-pink-500/30", soft: "bg-pink-500/5" },
  },
  insurance: {
    key: "insurance",
    title: "ביטוחים ורגולציה",
    hint: "פוליסות, אישורי בטיחות, רגולציה",
    icon: ShieldCheck,
    color: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", ring: "hover:ring-emerald-500/30", soft: "bg-emerald-500/5" },
  },
  real_estate: {
    key: "real_estate",
    title: 'נדל"ן וחוזים',
    hint: "חוזי שכירות, ניהול נכסים",
    icon: Building,
    color: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", ring: "hover:ring-amber-500/30", soft: "bg-amber-500/5" },
  },
};

/** Defaults applied when creating a new sub-category under a given domain. */
export const DOMAIN_DEFAULTS: Record<DomainKey, {
  is_assignable: boolean;
  protocol_type: "physical" | "vehicle" | "digital" | "license" | "insurance" | "training" | "real_estate";
  suggested_prefix: string;
}> = {
  physical:    { is_assignable: true,  protocol_type: "physical",    suggested_prefix: "GEN" },
  digital:     { is_assignable: false, protocol_type: "digital",     suggested_prefix: "DACC" },
  licenses:    { is_assignable: false, protocol_type: "license",     suggested_prefix: "SFT" },
  training:    { is_assignable: true,  protocol_type: "training",    suggested_prefix: "TRN" },
  insurance:   { is_assignable: false, protocol_type: "insurance",   suggested_prefix: "INS" },
  real_estate: { is_assignable: false, protocol_type: "real_estate", suggested_prefix: "LEASE" },
};

// --------- URL <-> internal key ---------
// Internal/DB slug uses underscore. URLs historically used `real-estate`.

const SLUG_TO_KEY: Record<string, DomainKey> = {
  physical: "physical",
  digital: "digital",
  licenses: "licenses",
  training: "training",
  insurance: "insurance",
  "real-estate": "real_estate",
  real_estate: "real_estate",
};

const KEY_TO_SLUG: Record<DomainKey, string> = {
  physical: "physical",
  digital: "digital",
  licenses: "licenses",
  training: "training",
  insurance: "insurance",
  real_estate: "real-estate",
};

export function domainSlugToKey(slug: string | undefined): DomainKey | null {
  if (!slug) return null;
  return SLUG_TO_KEY[slug] ?? null;
}
export function domainKeyToSlug(key: DomainKey): string {
  return KEY_TO_SLUG[key];
}
export function isDomainKey(value: string | undefined): value is DomainKey {
  return !!value && (DOMAIN_ORDER as string[]).includes(value);
}

/** Legacy fallback — classifies a category by its prefix/protocol_type. */
export function classifyCategory(c: { prefix?: string; protocol_type?: string }): DomainKey {
  if (c.prefix === "VRT" || c.protocol_type === "digital" || c.prefix === "DACC") return "digital";
  if (c.prefix === "SFT" || c.prefix === "MAN") return "licenses";
  if (c.protocol_type === "real_estate" || c.prefix === "LEASE") return "real_estate";
  if (c.protocol_type === "insurance" || c.prefix === "CERT" || c.prefix === "CINS") return "insurance";
  if (c.protocol_type === "training" || c.prefix === "MAINT") return "training";
  return "physical";
}

/** Primary lookup: prefers the DB `domain` column, falls back to legacy classifier. */
export function getDomain(c: { domain?: string | null; prefix?: string; protocol_type?: string } | null | undefined): DomainKey {
  if (!c) return "physical";
  const d = (c as any).domain as string | null | undefined;
  if (d && isDomainKey(d)) return d;
  return classifyCategory(c);
}

/** Group categories into domains in a single pass. */
export function groupCategoriesByDomain<T extends { id: string; domain?: string | null; prefix?: string; protocol_type?: string }>(
  categories: T[],
): Record<DomainKey, T[]> {
  const out: Record<DomainKey, T[]> = {
    physical: [],
    digital: [],
    licenses: [],
    training: [],
    insurance: [],
    real_estate: [],
  };
  for (const c of categories) out[getDomain(c)].push(c);
  return out;
}

/** Domains where each row is unique — no parent grouping. */
const FLAT_DOMAINS: DomainKey[] = ["real_estate"];

/** Returns the group-by key for an asset within its sub-category, per domain.
 *  Returns null when the domain should be displayed flat (no parent grouping).
 *  When the asset has an explicit `group_id` mapped to a known group, that
 *  group name is returned (takes priority over auto-grouping by asset_name). */
export function getGroupKey(
  asset: { asset_name?: string | null; custom_fields?: any; license_plate?: string | null; group_id?: string | null },
  domain: DomainKey,
  category?: { prefix?: string; protocol_type?: string } | null,
  groupsById?: Map<string, { name: string }>,
): string | null {
  if (asset.group_id && groupsById?.has(asset.group_id)) {
    return groupsById.get(asset.group_id)!.name;
  }
  if (FLAT_DOMAINS.includes(domain)) return null;
  if (domain === "physical" && category?.protocol_type === "vehicle") return null;
  if (domain === "insurance") {
    const t = (asset.custom_fields?.["סוג כיסוי"] ?? "").toString().trim();
    return t || "ללא סוג כיסוי";
  }
  return (asset.asset_name ?? "ללא שם").trim() || "ללא שם";
}

/**
 * Custom-field keys (Hebrew labels + English machine keys) rendered by the
 * domain-specific panel below the generic "פרטי הנכס" card. Use this to hide
 * them from the generic "שדות נוספים" list and avoid duplicate rows.
 */
export function getPanelOwnedCustomFieldKeys(
  domain: DomainKey | null,
  category?: { protocol_type?: string } | null,
): Set<string> {
  const keys = new Set<string>();
  const add = (...ks: string[]) => ks.forEach((k) => keys.add(k));

  if (category?.protocol_type === "vehicle") {
    add(
      "license_plate", "vehicle_type", "fuel_type", "year_of_manufacture", "current_km",
      "test_expiry", "insurance_expiry", "license_expiry",
      "מספר רישוי", "סוג רכב", "סוג דלק", "שנת ייצור", 'ק"מ נוכחי',
      "תוקף טסט", "תוקף ביטוח", "תוקף רישוי",
    );
    return keys;
  }
  switch (domain) {
    case "insurance":
      add(
        "insurance_company", "policy_number", "coverage_type", "coverage_amount",
        "premium", "annual_premium", "start_date", "end_date",
        "agent_name", "agent_phone", "agent_email",
        "חברת ביטוח", "מספר פוליסה", "סוג כיסוי", "סכום כיסוי",
        "פרמיה", "פרמיה שנתית", "תאריך תחילה", "תאריך סיום",
        "סוכן", "שם סוכן ביטוח", "סוכן ביטוח", "טלפון סוכן", "אימייל סוכן", "מייל סוכן",
      );
      break;
    case "licenses":
      add(
        "vendor", "plan", "seats",
        "ספק", "תוכנית", "Plan", "מס׳ מושבים", "מספר מושבים",
      );
      break;
    case "training":
      add(
        "provider", "completed_at", "certificate_url", "score",
        "ספק", "מדריך", "ספק / מדריך", "תאריך השלמה", "קישור לתעודה", "ציון", "ציון/תוצאה",
      );
      break;
    case "real_estate":
      add(
        "tenure", "address", "area_sqm", "floor", "landlord", "landlord_phone",
        "monthly_rent", "lease_start", "lease_end", "externally_managed", "management_company",
        "סטטוס בעלות", "כתובת", 'שטח (מ"ר)', "קומה", "משכיר", "טלפון משכיר",
        "שכ״ד חודשי", "תחילת חוזה", "סיום חוזה", "ניהול חיצוני", "חברת ניהול",
      );
      break;
    case "digital":
      add(
        "url", "username", "platform", "access_level",
        "כתובת", "שם משתמש", "פלטפורמה", "רמת גישה",
      );
      break;
    default:
      break;
  }
  return keys;
}

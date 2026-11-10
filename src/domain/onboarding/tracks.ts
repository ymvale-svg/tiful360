// Fulfilment tracks: how an onboarding item of a category is fulfilled, and whether HR sees the
// category in the onboarding form at all.
import { getDomain, type DomainKey } from "@/lib/assetDomains";

export type FulfillmentTrack = "equipment" | "access" | "vehicle" | "license" | "task" | "none";

export const TRACK_ORDER: Exclude<FulfillmentTrack, "none">[] = ["equipment", "access", "vehicle", "license", "task"];

export const TRACK_LABEL: Record<FulfillmentTrack, string> = {
  equipment: "ציוד",
  access: "הרשאות",
  vehicle: "רכב",
  license: "רישיונות ותוכנות",
  task: "משימות",
  none: "לא בקליטה",
};

export const TRACK_HINT: Record<FulfillmentTrack, string> = {
  equipment: "מהמלאי או פריט חדש, ומסירה לעובד",
  access: "פתיחת הרשאה במערכת",
  vehicle: "רכב לפי רמה, ומסירה לעובד",
  license: "הקצאת מושב מרישיון קיים",
  task: "סימון ביצוע, בלי נכס",
  none: "הקטגוריה לא מופיעה בטופס הקליטה",
};

const DOMAIN_DEFAULT_TRACK: Record<DomainKey, FulfillmentTrack> = {
  physical: "equipment",
  licenses: "license",
  training: "task",
  insurance: "none",
  real_estate: "none",
};

const ITEM_TYPE: Record<Exclude<FulfillmentTrack, "none">, string> = {
  equipment: "asset",
  access: "access",
  vehicle: "vehicle",
  license: "license",
  task: "task",
};

export interface TrackCategory {
  fulfillment_track?: string | null;
  show_in_onboarding?: boolean | null;
  protocol_type?: string | null;
  domain?: string | null;
  prefix?: string;
}

const isTrack = (v: unknown): v is FulfillmentTrack =>
  typeof v === "string" && (v in TRACK_LABEL);

/** The category's track: its own setting, else derived from its domain (vehicles by protocol type). */
export function resolveTrack(category: TrackCategory | null | undefined): FulfillmentTrack {
  if (!category) return "task";
  if (isTrack(category.fulfillment_track)) return category.fulfillment_track;
  if (category.protocol_type === "vehicle") return "vehicle";
  return DOMAIN_DEFAULT_TRACK[getDomain(category as Parameters<typeof getDomain>[0])];
}

/** Whether HR sees the category in the onboarding form. */
export function showInOnboarding(category: TrackCategory | null | undefined): boolean {
  if (!category) return false;
  if (typeof category.show_in_onboarding === "boolean") return category.show_in_onboarding;
  return resolveTrack(category) !== "none";
}

/** The onboarding_items.item_type an item of this category gets. */
export function itemTypeForCategory(category: TrackCategory | null | undefined): string {
  const track = resolveTrack(category);
  return track === "none" ? "task" : ITEM_TYPE[track];
}

/** Categories shown in the onboarding form, grouped by track in TRACK_ORDER. Empty tracks are left out. */
export function groupByTrack<T extends TrackCategory>(categories: T[]): Array<{ track: FulfillmentTrack; categories: T[] }> {
  const byTrack = new Map<FulfillmentTrack, T[]>();
  for (const c of categories) {
    if (!showInOnboarding(c)) continue;
    const track = resolveTrack(c);
    // A category hidden by its track but shown explicitly is worked as a task.
    const key = track === "none" ? "task" : track;
    byTrack.set(key, [...(byTrack.get(key) ?? []), c]);
  }
  return TRACK_ORDER.filter((t) => byTrack.has(t)).map((track) => ({ track, categories: byTrack.get(track)! }));
}

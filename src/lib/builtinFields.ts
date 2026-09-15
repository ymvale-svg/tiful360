// Built-in (fixed) fields per domain, per-sub-category visibility config, and
// smart per-domain defaults.
//
// Every domain declares the built-in fields that exist for it, with a default
// visibility flag. A sub-category (asset_groups) may override this with
// `visible_builtin_fields`: when null/undefined the domain defaults apply.

import type { DomainKey } from "@/lib/assetDomains";

export interface BuiltinField {
  key: string;
  label: string;
  /** Shown by default when the sub-category has no explicit config. */
  defaultVisible: boolean;
}

const COMMON_ASSIGN: BuiltinField[] = [
  { key: "current_owner_id", label: "שיוך לעובד", defaultVisible: true },
  { key: "notification_days_before", label: "התראת מייל מראש", defaultVisible: true },
];

export const BUILTIN_FIELDS: Partial<Record<DomainKey, BuiltinField[]>> = {
  physical: [
    { key: "serial_number", label: "מס׳ סידורי", defaultVisible: true },
    { key: "manufacturer_model", label: "יצרן ודגם", defaultVisible: true },
    { key: "condition", label: "מצב הציוד", defaultVisible: true },
    { key: "assigned_site_id", label: "שיוך לאתר", defaultVisible: true },
    { key: "expiry_date", label: "תאריך תפוגה", defaultVisible: true },
    ...COMMON_ASSIGN,
  ],
  _unused_vehicle_anchor: [
    { key: "license_plate", label: "לוחית רישוי", defaultVisible: true },
    { key: "vehicle_type", label: "סוג בעלות", defaultVisible: true },
    { key: "fuel_type", label: "סוג דלק", defaultVisible: true },
    { key: "year_of_manufacture", label: "שנת ייצור", defaultVisible: true },
    { key: "current_km", label: "קילומטראז׳", defaultVisible: true },
    { key: "test_expiry", label: "תוקף טסט", defaultVisible: true },
    { key: "insurance_expiry", label: "תוקף ביטוח", defaultVisible: true },
    { key: "license_expiry", label: "תוקף רישיון רכב", defaultVisible: true },
    { key: "insurance_company", label: "חברת ביטוח", defaultVisible: true },
    { key: "serial_number", label: "מס׳ סידורי", defaultVisible: false },
    { key: "condition", label: "מצב הציוד", defaultVisible: false },
    { key: "manufacturer_model", label: "יצרן ודגם", defaultVisible: false },
    { key: "expiry_date", label: "תאריך תפוגה", defaultVisible: false },
    { key: "assigned_site_id", label: "שיוך לאתר", defaultVisible: false },
    ...COMMON_ASSIGN,
  ],
  digital: [
    { key: "account_username", label: "שם משתמש", defaultVisible: true },
    { key: "account_url", label: "כתובת / URL", defaultVisible: true },
    { key: "mfa_enabled", label: "אימות דו-שלבי (MFA)", defaultVisible: true },
    { key: "password_expires_at", label: "תפוגת סיסמה", defaultVisible: true },
    { key: "license_expires_at", label: "תפוגת רישיון", defaultVisible: true },
    { key: "serial_number", label: "מס׳ סידורי", defaultVisible: false },
    { key: "manufacturer_model", label: "יצרן ודגם", defaultVisible: false },
    { key: "condition", label: "מצב הציוד", defaultVisible: false },
    { key: "assigned_site_id", label: "שיוך לאתר", defaultVisible: false },
    { key: "expiry_date", label: "תאריך תפוגה", defaultVisible: false },
    ...COMMON_ASSIGN,
  ],
  licenses: [
    { key: "vendor", label: "ספק", defaultVisible: true },
    { key: "plan", label: "תוכנית/Plan", defaultVisible: true },
    { key: "seats", label: "מס׳ מושבים", defaultVisible: true },
    { key: "account_username", label: "שם משתמש", defaultVisible: true },
    { key: "account_url", label: "כתובת / URL", defaultVisible: true },
    { key: "license_expires_at", label: "תפוגת רישיון", defaultVisible: true },
    { key: "expiry_date", label: "תאריך תפוגה", defaultVisible: true },
    { key: "serial_number", label: "מס׳ סידורי / מס׳ כרטיס", defaultVisible: false },
    { key: "manufacturer_model", label: "יצרן ודגם", defaultVisible: false },
    { key: "condition", label: "מצב הציוד", defaultVisible: false },
    { key: "assigned_site_id", label: "שיוך לאתר", defaultVisible: false },
    ...COMMON_ASSIGN,
  ],
  training: [
    { key: "expiry_date", label: "תוקף הכשרה", defaultVisible: true },
    { key: "serial_number", label: "מס׳ סידורי", defaultVisible: false },
    { key: "manufacturer_model", label: "יצרן ודגם", defaultVisible: false },
    { key: "condition", label: "מצב הציוד", defaultVisible: false },
    { key: "assigned_site_id", label: "שיוך לאתר", defaultVisible: false },
    ...COMMON_ASSIGN,
  ],
  insurance: [
    { key: "expiry_date", label: "תוקף עד", defaultVisible: true },
    { key: "serial_number", label: "מס׳ סידורי", defaultVisible: false },
    { key: "manufacturer_model", label: "יצרן ודגם", defaultVisible: false },
    { key: "condition", label: "מצב הציוד", defaultVisible: false },
    { key: "assigned_site_id", label: "שיוך לאתר", defaultVisible: false },
    { key: "current_owner_id", label: "שיוך לעובד", defaultVisible: false },
    { key: "notification_days_before", label: "התראת מייל מראש", defaultVisible: true },
  ],
  real_estate: [
    { key: "assigned_site_id", label: "שיוך לאתר", defaultVisible: true },
    { key: "expiry_date", label: "תאריך תפוגה", defaultVisible: true },
    { key: "serial_number", label: "מס׳ סידורי", defaultVisible: false },
    { key: "manufacturer_model", label: "יצרן ודגם", defaultVisible: false },
    { key: "condition", label: "מצב הציוד", defaultVisible: false },
    { key: "current_owner_id", label: "שיוך לעובד", defaultVisible: false },
    { key: "notification_days_before", label: "התראת מייל מראש", defaultVisible: true },
  ],
};

export function getBuiltinFields(domain: DomainKey | null | undefined): BuiltinField[] {
  return (domain && BUILTIN_FIELDS[domain]) || [];
}

/** Vehicle expiry/insurance fields are relevant only for company-owned cars. */
export const OWNED_VEHICLE_ONLY_KEYS = new Set([
  "test_expiry",
  "insurance_expiry",
  "license_expiry",
  "insurance_company",
]);

/** Ownership type derived from the sub-category name (leasing/rental/owned). */
export function isCompanyOwnedVehicleGroup(group: { name?: string | null } | null | undefined): boolean {
  const n = (group?.name ?? "").trim();
  if (n.includes("השכר")) return false;
  if (n.includes("ליסינג")) return false;
  return true;
}

type GroupLike = { visible_builtin_fields?: unknown } | null | undefined;

function configOf(group: GroupLike): string[] | null {
  const raw = group?.visible_builtin_fields;
  if (!Array.isArray(raw)) return null;
  return raw.map(String);
}

/**
 * Is this built-in field relevant for the given sub-category?
 * An explicit sub-category config wins; otherwise the domain default applies.
 * Fields unknown to the domain registry are treated as visible (never hide
 * something the registry doesn't know about).
 */
export function isBuiltinFieldVisible(
  group: GroupLike,
  key: string,
  domain?: DomainKey | null,
): boolean {
  const cfg = configOf(group);
  if (cfg) return cfg.includes(key);
  const spec = getBuiltinFields(domain ?? null).find((f) => f.key === key);
  return spec ? spec.defaultVisible : true;
}

/**
 * Should a field row be rendered?
 * Hidden when the sub-category/domain excluded it, or (in read mode) when it
 * has no value.
 */
export function showFieldRow(
  group: GroupLike,
  key: string,
  value: unknown,
  editing: boolean,
  domain?: DomainKey | null,
): boolean {
  if (!isBuiltinFieldVisible(group, key, domain)) return false;
  if (editing) return true;
  return !(value === null || value === undefined || value === "");
}

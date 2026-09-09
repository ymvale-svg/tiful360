// Built-in (fixed) fields per domain, and per-sub-category visibility config.
// A sub-category (asset_groups) may declare which built-in fields are relevant;
// when `visible_builtin_fields` is null/undefined every field is shown.

import type { DomainKey } from "@/lib/assetDomains";

export interface BuiltinField {
  key: string;
  label: string;
}

export const BUILTIN_FIELDS: Partial<Record<DomainKey, BuiltinField[]>> = {
  digital: [
    { key: "account_username", label: "שם משתמש" },
    { key: "account_url", label: "כתובת / URL" },
    { key: "mfa_enabled", label: "אימות דו-שלבי (MFA)" },
    { key: "password_expires_at", label: "תפוגת סיסמה" },
    { key: "license_expires_at", label: "תפוגת רישיון" },
  ],
  licenses: [
    { key: "vendor", label: "ספק" },
    { key: "plan", label: "תוכנית/Plan" },
    { key: "seats", label: "מס׳ מושבים" },
    { key: "account_username", label: "שם משתמש" },
    { key: "account_url", label: "כתובת / URL" },
    { key: "license_expires_at", label: "תפוגת רישיון" },
  ],
};

export function getBuiltinFields(domain: DomainKey | null | undefined): BuiltinField[] {
  return (domain && BUILTIN_FIELDS[domain]) || [];
}

type GroupLike = { visible_builtin_fields?: unknown } | null | undefined;

function configOf(group: GroupLike): string[] | null {
  const raw = group?.visible_builtin_fields;
  if (!Array.isArray(raw)) return null;
  return raw.map(String);
}

/** Is this built-in field relevant for the given sub-category? */
export function isBuiltinFieldVisible(group: GroupLike, key: string): boolean {
  const cfg = configOf(group);
  if (!cfg) return true;
  return cfg.includes(key);
}

/**
 * Should a field row be rendered?
 * Hidden when the sub-category excluded it, or (in read mode) when it has no value.
 */
export function showFieldRow(
  group: GroupLike,
  key: string,
  value: unknown,
  editing: boolean,
): boolean {
  if (!isBuiltinFieldVisible(group, key)) return false;
  if (editing) return true;
  return !(value === null || value === undefined || value === "");
}

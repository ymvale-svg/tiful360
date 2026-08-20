import type { ProtocolField } from "@/lib/pdf/types";

export interface HandoverAssetLike {
  id?: string;
  asset_code?: string | null;
  asset_name?: string | null;
  serial_number?: string | null;
  manufacturer_model?: string | null;
  condition?: string | null;
  license_plate?: string | null;
  vehicle_type?: string | null;
  fuel_type?: string | null;
  year_of_manufacture?: number | null;
  current_km?: number | null;
  test_expiry?: string | null;
  insurance_expiry?: string | null;
  license_expiry?: string | null;
  insurance_company?: string | null;
  insurance_policy_number?: string | null;
  account_username?: string | null;
  account_url?: string | null;
  custom_fields?: Record<string, any> | null;
  asset_categories?: { category_name?: string | null } | null;
}

export const CONDITION_LABELS: Record<string, string> = {
  new: "חדש",
  good: "תקין",
  fair: "בינוני",
  damaged: "פגום",
};

function fmtDate(d?: string | null) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-GB");
  } catch {
    return d;
  }
}

/**
 * All candidate protocol fields for an item, in display order.
 * Empty values are dropped so the picker only shows what actually exists.
 */
export function buildCandidateFields(
  asset: HandoverAssetLike,
  categoryName?: string | null
): ProtocolField[] {
  const raw: ProtocolField[] = [
    { key: "asset_name", label: "שם הפריט", value: asset.asset_name ?? "" },
    { key: "asset_code", label: "קוד פריט", value: asset.asset_code ?? "" },
    { key: "category", label: "קטגוריה", value: categoryName ?? asset.asset_categories?.category_name ?? "" },
    { key: "manufacturer_model", label: "יצרן / דגם", value: asset.manufacturer_model ?? "" },
    { key: "serial_number", label: "מספר סידורי", value: asset.serial_number ?? "" },
    {
      key: "condition",
      label: "מצב הפריט",
      value: asset.condition ? CONDITION_LABELS[asset.condition] ?? asset.condition : "",
    },
    { key: "license_plate", label: "מספר רישוי", value: asset.license_plate ?? "" },
    { key: "vehicle_type", label: "סוג רכב", value: asset.vehicle_type ?? "" },
    { key: "fuel_type", label: "סוג דלק", value: asset.fuel_type ?? "" },
    {
      key: "year_of_manufacture",
      label: "שנת ייצור",
      value: asset.year_of_manufacture ? String(asset.year_of_manufacture) : "",
    },
    { key: "current_km", label: 'ק"מ במד', value: asset.current_km != null ? String(asset.current_km) : "" },
    { key: "test_expiry", label: "תוקף טסט", value: fmtDate(asset.test_expiry) },
    { key: "insurance_expiry", label: "תוקף ביטוח", value: fmtDate(asset.insurance_expiry) },
    { key: "license_expiry", label: "תוקף רישוי", value: fmtDate(asset.license_expiry) },
    { key: "insurance_company", label: "חברת ביטוח", value: asset.insurance_company ?? "" },
    { key: "insurance_policy_number", label: "מספר פוליסה", value: asset.insurance_policy_number ?? "" },
    { key: "account_username", label: "שם משתמש", value: asset.account_username ?? "" },
    { key: "account_url", label: "כתובת מערכת", value: asset.account_url ?? "" },
  ];

  const custom = asset.custom_fields ?? {};
  for (const [k, v] of Object.entries(custom)) {
    if (v === null || v === undefined || `${v}`.trim() === "") continue;
    raw.push({ key: `custom.${k}`, label: k, value: Array.isArray(v) ? v.join(", ") : `${v}` });
  }

  return raw.filter((f) => `${f.value}`.trim() !== "");
}

/** Keys selected by default when a template/category has no explicit defaults. */
export const DEFAULT_FIELD_KEYS = [
  "asset_name",
  "asset_code",
  "category",
  "manufacturer_model",
  "serial_number",
  "condition",
  "license_plate",
  "vehicle_type",
  "year_of_manufacture",
  "current_km",
];

/** Placeholder values available to protocol template bodies. */
export function buildPlaceholderValues(args: {
  asset: HandoverAssetLike;
  categoryName?: string | null;
  employeeName: string;
  employeeIdNumber?: string | null;
  companyName: string;
  issuerName?: string | null;
  odometer?: number | null;
  now?: Date;
}): Record<string, string> {
  const now = args.now ?? new Date();
  return {
    employee_name: args.employeeName ?? "",
    employee_id: args.employeeIdNumber ?? "",
    asset_name: args.asset.asset_name ?? "",
    asset_code: args.asset.asset_code ?? "",
    serial: args.asset.serial_number ?? args.asset.asset_code ?? "",
    category: args.categoryName ?? args.asset.asset_categories?.category_name ?? "",
    manufacturer_model: args.asset.manufacturer_model ?? "",
    license_plate: args.asset.license_plate ?? "",
    odometer: args.odometer != null ? String(args.odometer) : args.asset.current_km != null ? String(args.asset.current_km) : "",
    issuer_name: args.issuerName ?? "",
    date: now.toLocaleDateString("en-GB"),
    time: now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
    company_name: args.companyName ?? "",
  };
}

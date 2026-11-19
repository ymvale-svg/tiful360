// Rows of the vehicle and leasing tables (supabase/migrations/20261110250000_vehicle_leasing.sql).

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  kind: "leasing" | "equipment" | "software" | "other";
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface VehicleTier {
  id: string;
  company_id: string;
  name: string;
  level: number;
  monthly_cap: number | null;
  allowed_models: string | null;
  description: string | null;
  is_active: boolean;
  vehicle_tier_roles?: Array<{ id: string; role_name: string; department: string | null }>;
}

export interface VehiclePreferences {
  fuel?: string | null;
  gearbox?: string | null;
  models?: string[];
  notes?: string | null;
}

export type VehicleRequestStatus = "draft" | "quotes_requested" | "chosen" | "ordered" | "delivered" | "cancelled";

export interface VehicleQuote {
  id: string;
  request_id: string;
  supplier_id: string | null;
  model: string | null;
  monthly_price: number | null;
  km_per_year: number | null;
  period_months: number | null;
  delivery_date: string | null;
  includes: string | null;
  notes: string | null;
  file_path: string | null;
  extracted: unknown;
  created_at: string;
  suppliers?: { name: string } | null;
}

export interface VehicleRequest {
  id: string;
  company_id: string;
  employee_id: string;
  onboarding_item_id: string | null;
  tier_id: string | null;
  preferences: VehiclePreferences;
  desired_date: string | null;
  period_months: number;
  status: VehicleRequestStatus;
  quote_subject: string | null;
  quote_body: string | null;
  requested_supplier_ids: string[];
  quotes_requested_at: string | null;
  chosen_quote_id: string | null;
  ordered_at: string | null;
  delivered_at: string | null;
  created_by_name: string | null;
  created_at: string;
  employees?: { full_name: string; role: string | null; department: string | null; start_date: string | null } | null;
  vehicle_tiers?: Pick<VehicleTier, "name" | "monthly_cap" | "allowed_models"> | null;
  vehicle_quotes?: VehicleQuote[];
}

export const FUEL_OPTIONS = ["היברידי", "חשמלי", "פלאג-אין", "בנזין", "דיזל"];
export const GEARBOX_OPTIONS = ["אוטומט", "ידני"];

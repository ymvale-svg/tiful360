// Shared PDF form data interfaces — no UI deps.

export interface HandoverFormAsset {
  asset_id?: string;
  asset_name: string;
  asset_code?: string | null;
  category_name?: string | null;
  manufacturer_model?: string | null;
  serial_number?: string | null;
  condition?: string | null; // 'new' | 'good' | 'fair'
}

export interface HandoverFormData {
  company_name: string;
  /** Logo is baked into the template — kept for backward compatibility, ignored. */
  company_logo_url?: string | null;
  employee_name: string;
  employee_department: string;
  date: string;

  /** New multi-asset shape (preferred). */
  assets?: HandoverFormAsset[];

  // Backward-compat single-asset fields (used when `assets` is missing).
  asset_name?: string;
  category_name?: string | null;
  manufacturer_model?: string | null;
  asset_code?: string;
  condition?: string;

  receiver_signature?: string | null;
  issuer_signature?: string | null;
}

export interface OffboardingFormAsset {
  asset_id: string;
  asset_name: string;
  asset_code: string;
  category_name?: string | null;
  manufacturer_model?: string | null;
  serial_number?: string | null;
  condition_at_return?: string | null; // 'good' | 'damaged' | 'missing'
  notes?: string | null;
}

export interface OffboardingFormData {
  company_name: string;
  company_logo_url?: string | null;
  employee_name: string;
  employee_id_number?: string | null;
  employee_department: string;
  employee_role?: string | null;
  end_date?: string | null;
  date: string;
  form_index: number;
  assets: OffboardingFormAsset[];
  /** Aggregated condition for the whole form (zikui template has a checkbox row). */
  overall_condition?: "good" | "damaged" | "missing" | null;
  /** Free-text notes line. */
  general_notes?: string | null;
  receiver_signature?: string | null;
  issuer_signature?: string | null;
}

/**
 * Resource allowlist for the external API (`open-api`).
 *
 * Only what is listed here can be reached from outside, and only through the
 * columns named in each entry. A resource that is not in this map is refused
 * before any database query runs.
 *
 * `writable` is the exact set of columns a caller may set on create/update.
 * Columns that carry money or balances (salaries, payment amounts, vacation and
 * sick balances), identity links, signatures or audit data are left out on
 * purpose, so a key can never rewrite them.
 */

export type Scope = "read" | "write" | "delete" | "payroll" | "identity";
export type ApiAction =
  | "list" | "get" | "create" | "update" | "delete" | "preview_delete" | "capabilities";

export interface ResourceDef {
  /** database table the resource maps to */
  table: string;
  /** Hebrew name used in error messages */
  label: string;
  /** column that holds the company */
  company: string;
  /** actions this resource answers to at all */
  actions: ApiAction[];
  /** columns a caller may set on create / update; absent means the resource is read only */
  writable?: string[];
  /** columns a caller may filter on (defaults to id + writable) */
  filters?: string[];
  /** columns a free-text search may look in */
  search?: string[];
  /** default ordering */
  order?: string;
  /** explicit column list to return (defaults to the whole row) */
  select?: string;
  /**
   * columns that are never returned to a key: signatures, signing-link tokens,
   * GPS payloads and internal snapshots. Stripped from every row by publicRow().
   */
  omit?: string[];
  /**
   * identifying details (ID number, birth date, address, family status) that are
   * returned, searched and filtered only for a key with the identity scope.
   */
  identity?: string[];
  /** payroll scope is additionally required */
  payroll?: boolean;
  /** how many rows one delete may take */
  maxDelete?: number;
}

/** Employee details that identify a person; they need the identity scope. */
export const IDENTITY_COLUMNS = [
  "id_number", "birth_date", "street", "house_number", "city", "postal_code", "po_box",
  "marital_status", "country_of_birth", "aliyah_date", "health_fund_member",
];

const READ_WRITE_DELETE: ApiAction[] = ["list", "get", "create", "update", "delete", "preview_delete"];
const READ_WRITE: ApiAction[] = ["list", "get", "create", "update"];
const READ_ONLY: ApiAction[] = ["list", "get"];

export const RESOURCES: Record<string, ResourceDef> = {
  // ── people ────────────────────────────────────────────────────────────────
  employees: {
    table: "employees",
    omit: ["offboarding_snapshot"],
    identity: IDENTITY_COLUMNS,
    label: "עובדים",
    company: "company_id",
    // no delete from outside: deleting an employee cascades to forms 101, attendance,
    // leave and onboarding. Ending employment goes through offboarding_processes.
    actions: READ_WRITE,
    order: "full_name",
    search: ["full_name", "id_number", "email", "phone", "department", "employee_code"],
    filters: ["id", "employee_code", "full_name", "id_number", "email", "phone", "department", "status", "role", "sub_employer_id", "tracks_attendance", "can_remote_punch", "start_date", "end_date", "created_at"],
    writable: [
      "employee_code", "full_name", "id_number", "role", "department", "direct_manager_id", "status",
      "start_date", "end_date", "phone", "email", "birth_date", "gender", "street", "house_number", "city", "postal_code", "po_box",
      "country_of_birth", "aliyah_date", "marital_status", "is_israeli_resident",
      "health_fund_member", "sub_employer_id", "can_remote_punch",
      "birthday_calendar_preference", "hebrew_birth_day", "hebrew_birth_month",
      "hebrew_birth_year", "work_days", "tracks_attendance",
      "attendance_notifications_disabled", "exclude_from_contacts", "contact_sort_order",
    ],
  },
  sub_employers: {
    table: "sub_employers",
    label: "מעסיקים / תת-חברות",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "legal_name",
    search: ["legal_name", "tax_id", "city"],
    writable: ["legal_name", "tax_id", "address", "city", "postal_code", "phone", "email", "withholding_file_number", "contact_name", "is_active"],
  },
  portal_contacts: {
    table: "portal_contacts",
    label: "אנשי קשר",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "sort_order",
    search: ["name", "email", "phone", "department"],
    writable: ["name", "role", "department", "phone", "email", "sort_order"],
  },

  // ── equipment ─────────────────────────────────────────────────────────────
  assets: {
    table: "assets",
    label: "נכסים וציוד",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "asset_name",
    search: ["asset_name", "asset_code", "serial_number", "license_plate", "manufacturer_model", "notes"],
    filters: ["id", "asset_code", "asset_name", "serial_number", "category_id", "group_id", "current_owner_id", "status", "assigned_site_id", "expiry_date", "license_plate", "created_at"],
    writable: [
      "asset_code", "asset_name", "category_id", "group_id", "serial_number", "current_owner_id",
      "status", "custom_fields", "expiry_date", "notes", "manufacturer_model",
      "condition", "notification_days_before", "license_plate", "vehicle_type",
      "fuel_type", "year_of_manufacture", "current_km", "test_expiry", "insurance_expiry",
      "license_expiry", "insurance_company", "insurance_policy_number", "account_username",
      "account_url", "mfa_enabled", "password_expires_at", "license_expires_at",
      "assigned_site_id", "container_id", "site_location",
    ],
  },
  asset_categories: {
    table: "asset_categories",
    label: "קטגוריות",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "sort_order",
    search: ["category_name", "description"],
    writable: ["category_name", "prefix", "description", "icon", "is_assignable", "sort_order", "skip_handover_form", "skip_return_form", "default_notification_days_before", "protocol_type", "signing_protocol", "domain", "onboarding_form_group", "default_owner_role", "protocol_field_defaults", "fulfillment_track", "show_in_onboarding"],
  },
  asset_groups: {
    table: "asset_groups",
    label: "תת-קטגוריות",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "sort_order",
    search: ["name", "description"],
    writable: ["category_id", "name", "description", "sort_order", "default_owner_role", "is_vehicle_related", "visible_builtin_fields", "hidden_category_fields"],
  },
  category_fields: {
    table: "category_fields",
    label: "שדות מותאמים",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "sort_order",
    search: ["field_name"],
    writable: ["category_id", "group_id", "field_name", "field_type", "is_required", "field_options", "sort_order", "is_expiry_field"],
  },
  asset_documents: {
    table: "asset_documents",
    label: "מסמכי נכס",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "uploaded_at",
    writable: ["asset_id", "document_type", "document_label", "file_url", "file_name", "file_size_bytes", "expiry_date", "notes", "period", "is_archived"],
  },
  sites: {
    table: "sites",
    label: "אתרים",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "name",
    search: ["name", "address", "contact_name"],
    writable: ["name", "address", "contact_name", "phone", "notes", "is_active"],
  },
  suppliers: {
    table: "suppliers",
    label: "ספקים",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "name",
    search: ["name", "contact_name", "email", "phone"],
    writable: ["name", "kind", "contact_name", "email", "phone", "notes", "is_active"],
  },

  // ── service tickets ───────────────────────────────────────────────────────
  service_tickets: {
    table: "it_tickets",
    label: "קריאות שירות",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "created_at",
    search: ["ticket_code", "title", "description", "location", "contact_phone"],
    filters: ["id", "ticket_code", "title", "status", "priority", "ticket_type", "employee_id", "assigned_to", "sla_deadline", "created_at", "related_asset_id"],
    writable: [
      "ticket_code", "title", "employee_id", "ticket_type", "priority", "status", "assigned_to",
      "sla_deadline", "checklist", "description", "location", "contact_phone",
      "subject_category", "related_asset_id", "attachments",
    ],
  },

  // ── knowledge ─────────────────────────────────────────────────────────────
  guides: {
    table: "guides",
    label: "מדריכים",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "sort_order",
    search: ["title", "description"],
    writable: ["topic_id", "title", "description", "content_type", "resource_url", "file_name", "sort_order", "is_visible"],
  },
  guide_topics: {
    table: "guide_topics",
    label: "נושאי מדריכים",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "sort_order",
    search: ["name"],
    writable: ["name", "topic_type", "logo_url", "color_key", "sort_order", "is_visible"],
  },
  protocols: {
    table: "document_protocols",
    label: "נהלים ופרוטוקולים",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "display_name",
    search: ["display_name"],
    writable: ["protocol_type", "display_name", "body_template", "requires_employee_sig", "requires_issuer_sig", "validity_days", "category_id", "group_id", "field_defaults"],
  },
  procedure_departments: {
    table: "procedure_departments",
    label: "מחלקות נהלים",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "sort_order",
    search: ["name"],
    writable: ["name", "sort_order", "is_visible"],
  },
  knowledge_base: {
    table: "knowledge_base",
    label: "מאגר ידע",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "sort_order",
    search: ["title", "content", "description", "category"],
    writable: ["title", "content", "category", "file_url", "department_id", "description", "sort_order", "is_visible"],
  },

  // ── vehicles & subscriptions ──────────────────────────────────────────────
  employee_vehicles: {
    table: "employee_vehicles",
    label: "רכבי עובדים",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "license_plate",
    search: ["license_plate", "notes"],
    writable: ["employee_id", "license_plate", "notes"],
  },
  vehicle_subscriptions: {
    table: "vehicle_subscriptions",
    label: "מנויי רכב",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "start_date",
    writable: ["employee_vehicle_id", "asset_id", "provider", "start_date", "status", "notes"],
  },
  insurance_payments: {
    table: "insurance_payments",
    label: "תשלומי ביטוח",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "due_date",
    writable: ["asset_id", "due_date", "note", "paid_at"],
  },

  // ── attendance & leave ────────────────────────────────────────────────────
  attendance_punches: {
    table: "attendance_punches",
    omit: ["raw_payload"],
    label: "החתמות",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "punch_at",
    filters: ["id", "employee_id", "punch_at", "direction", "source", "status", "created_at"],
    writable: ["employee_code_raw", "employee_id", "punch_at", "direction", "source", "status", "geo_address"],
  },
  attendance_corrections: {
    table: "attendance_corrections",
    label: "תיקוני נוכחות",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "created_at",
    writable: ["employee_id", "correction_date", "requested_check_in", "requested_check_out", "reason", "manager_note", "status"],
  },
  leave_requests: {
    table: "leave_requests",
    label: "בקשות חופשה",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "created_at",
    writable: ["employee_id", "request_type", "start_date", "end_date", "total_days", "reason", "status", "manager_note"],
  },

  // ── payroll (needs the payroll scope on top of read) ──────────────────────
  payslips: {
    table: "payslips",
    label: "תלושי שכר",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    payroll: true,
    order: "created_at",
    filters: ["id", "employee_id", "period_year", "period_month", "extraction_status", "id_number_detected", "employee_name_detected", "created_at"],
    writable: ["employee_id", "employee_name_detected", "period_year", "period_month", "work_days", "work_hours", "work_days_num", "extraction_notes"],
  },
  payslip_batches: {
    table: "payslip_batches",
    label: "אצוות תלושים",
    company: "company_id",
    actions: READ_ONLY,
    payroll: true,
    order: "created_at",
  },

  // ── access & permissions ──────────────────────────────────────────────────
  permission_groups: {
    table: "permission_groups",
    label: "קבוצות הרשאה",
    company: "company_id",
    // read only from outside: a key must never grant roles or move rows between companies
    // (the group/system triggers set company_id from the parent row, not from the key).
    actions: READ_ONLY,
    order: "name",
    search: ["name", "description"],
    filters: ["name", "description", "roles", "system_key"],
  },
  permission_group_members: {
    table: "permission_group_members",
    label: "חברי קבוצות הרשאה",
    company: "company_id",
    // read only from outside: a key must never grant roles or move rows between companies
    // (the group/system triggers set company_id from the parent row, not from the key).
    actions: READ_ONLY,
    order: "created_at",
    filters: ["group_id", "user_id"],
  },
  system_access_systems: {
    table: "system_access_systems",
    label: "מערכות",
    company: "company_id",
    // read only from outside: a key must never grant roles or move rows between companies
    // (the group/system triggers set company_id from the parent row, not from the key).
    actions: READ_ONLY,
    order: "sort_order",
    search: ["name"],
    filters: ["name", "provisioning", "owner_role", "owner_user_id", "resource_label", "is_active", "sort_order"],
  },
  system_access_resources: {
    table: "system_access_resources",
    label: "סביבות ופריטים",
    company: "company_id",
    // read only from outside: a key must never grant roles or move rows between companies
    // (the group/system triggers set company_id from the parent row, not from the key).
    actions: READ_ONLY,
    order: "sort_order",
    search: ["name", "path"],
    filters: ["system_id", "parent_id", "name", "path", "external_ref", "is_active", "sort_order"],
  },
  system_access_grants: {
    table: "system_access_grants",
    label: "הרשאות מערכת",
    company: "company_id",
    // request_id links every grant to an internal access request, so grants are
    // read-only from outside: they are created by the request flow in the app.
    actions: READ_ONLY,
    order: "created_at",
  },

  // ── processes & documents ─────────────────────────────────────────────────
  onboarding_processes: {
    table: "onboarding_processes",
    omit: ["audit_log"],
    label: "תהליכי קליטה",
    company: "company_id",
    actions: READ_WRITE,
    order: "created_at",
    writable: ["employee_id", "status", "access_picks"],
  },
  offboarding_processes: {
    table: "offboarding_processes",
    label: "תהליכי עזיבה",
    company: "company_id",
    actions: READ_WRITE,
    order: "created_at",
    writable: ["employee_id", "last_working_day", "status"],
  },
  employee_documents: {
    table: "employee_documents",
    label: "מסמכי עובד",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "uploaded_at",
    writable: ["employee_id", "document_type", "document_label", "file_url", "file_name", "file_size_bytes", "expiry_date", "notes"],
  },
  signed_documents: {
    table: "signed_documents",
    omit: ["employee_signature", "issuer_signature"],
    label: "מסמכים חתומים",
    company: "company_id",
    actions: READ_ONLY,
    order: "issued_at",
  },
  tax_form_101: {
    table: "tax_form_101",
    omit: ["access_token", "token_expires_at", "signature_data"],
    label: "טופסי 101",
    company: "company_id",
    actions: READ_ONLY,
    payroll: true,
    order: "created_at",
  },
  announcements: {
    table: "announcements",
    label: "הודעות",
    company: "company_id",
    actions: READ_WRITE_DELETE,
    order: "created_at",
    search: ["title", "content"],
    writable: ["title", "content", "published_at", "expires_at", "sender_name", "sender_role"],
  },

  // ── company (read only on purpose) ────────────────────────────────────────
  companies: {
    table: "companies",
    label: "חברות",
    company: "id",
    actions: READ_ONLY,
    order: "name",
    search: ["name"],
    // git_password_encrypted is never returned.
    select: "id, name, logo_url, payroll_emails, it_emails, operations_emails, expiry_notification_emails, hr_emails, secretariat_emails, git_enabled, git_base_url, git_default_site_code, portal_name, portal_logo_url, portal_primary_color, attendance_corrections_auto_approve, domain_labels, michpal_absence_codes",
    filters: ["id", "name"],
  },
};

/** A row as an external key may see it: without the resource's omitted columns. */
export function publicRow<T extends Record<string, unknown> | null | undefined>(def: ResourceDef, row: T): T {
  if (!row || !def.omit?.length) return row;
  const out: Record<string, unknown> = { ...row };
  for (const c of def.omit) delete out[c];
  return out as T;
}

/**
 * The resource as one key may use it: without the identity scope, the identifying
 * columns are omitted from rows and cannot be searched, filtered, sorted on or written.
 */
export function resourceForScopes(def: ResourceDef, scopes: readonly string[] | null | undefined): ResourceDef {
  if (!def.identity?.length || (scopes ?? []).includes("identity")) return def;
  const hidden = new Set(def.identity);
  return {
    ...def,
    omit: [...(def.omit ?? []), ...def.identity],
    search: def.search?.filter((c) => !hidden.has(c)),
    filters: def.filters?.filter((c) => !hidden.has(c)),
    writable: def.writable?.filter((c) => !hidden.has(c)),
  };
}

/**
 * Whether a key may close service tickets through it-api. Keys created in the keys
 * screen (they have an owner) need the write scope; older keys without an owner
 * predate scopes and keep working.
 */
export function itApiKeyMayWrite(key: { owner_user_id?: string | null; scopes?: readonly string[] | null }): boolean {
  if (!key.owner_user_id) return true;
  return (key.scopes ?? []).includes("write");
}

/** Which permission a caller needs for one action. */
export function scopeForAction(action: ApiAction): Scope {
  if (action === "delete" || action === "preview_delete") return "delete";
  if (action === "create" || action === "update") return "write";
  return "read";
}

/**
 * Columns a caller may filter on: id + writable + the explicit filter list,
 * minus any column the key may not see (filtering on it would reveal it).
 */
export function filterableColumns(def: ResourceDef): string[] {
  const base = new Set<string>(["id", "created_at"]);
  for (const c of def.writable ?? []) base.add(c);
  for (const c of def.filters ?? []) base.add(c);
  base.add(def.company);
  for (const c of def.omit ?? []) base.delete(c);
  return Array.from(base);
}

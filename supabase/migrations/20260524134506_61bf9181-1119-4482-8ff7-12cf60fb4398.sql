-- Digital access columns on assets
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS account_username text,
  ADD COLUMN IF NOT EXISTS account_url text,
  ADD COLUMN IF NOT EXISTS mfa_enabled boolean,
  ADD COLUMN IF NOT EXISTS password_expires_at date,
  ADD COLUMN IF NOT EXISTS license_expires_at date;

-- Migrate existing data from custom_fields
UPDATE public.assets a
SET
  account_username   = COALESCE(a.account_username,   NULLIF(a.custom_fields->>'שם משתמש', ''), NULLIF(a.custom_fields->>'username', '')),
  account_url        = COALESCE(a.account_url,        NULLIF(a.custom_fields->>'כתובת URL', ''), NULLIF(a.custom_fields->>'url', '')),
  mfa_enabled        = COALESCE(a.mfa_enabled,
                         CASE
                           WHEN (a.custom_fields->>'MFA') ILIKE 'true' OR (a.custom_fields->>'MFA') ILIKE 'כן' OR (a.custom_fields->>'mfa') = 'true' THEN true
                           WHEN (a.custom_fields->>'MFA') ILIKE 'false' OR (a.custom_fields->>'MFA') ILIKE 'לא' OR (a.custom_fields->>'mfa') = 'false' THEN false
                           ELSE NULL
                         END),
  password_expires_at = COALESCE(a.password_expires_at, NULLIF(a.custom_fields->>'תפוגת סיסמה','')::date, NULLIF(a.custom_fields->>'password_expires_at','')::date),
  license_expires_at  = COALESCE(a.license_expires_at,  NULLIF(a.custom_fields->>'תפוגת רישיון','')::date, NULLIF(a.custom_fields->>'license_expires_at','')::date)
FROM public.asset_categories c
WHERE a.category_id = c.id
  AND c.protocol_type = 'digital';

-- Update get_expiring_assets: add password/license expiry for digital protocol_type categories from assets columns
CREATE OR REPLACE FUNCTION public.get_expiring_assets(_company_id uuid, _days_ahead integer DEFAULT 14)
RETURNS TABLE (
  asset_id uuid,
  asset_name text,
  asset_code text,
  category_id uuid,
  category_name text,
  category_prefix text,
  is_assignable boolean,
  source_type text,
  source_id uuid,
  field_key text,
  field_label text,
  expiry_date date,
  days_left integer,
  current_owner_id uuid,
  owner_name text,
  custom_fields jsonb,
  domain text,
  expiry_type text,
  assignee_role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Physical & generic asset.expiry_date (legacy)
  SELECT
    a.id, a.asset_name, a.asset_code,
    c.id, c.category_name, c.prefix, c.is_assignable,
    'asset'::text, a.id, NULL::text, 'תפוגה',
    a.expiry_date, (a.expiry_date - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name, a.custom_fields,
    COALESCE(c.protocol_type::text, 'physical'), 'asset_expiry',
    CASE c.protocol_type::text
      WHEN 'digital' THEN 'it'
      WHEN 'vehicle' THEN 'operations'
      WHEN 'insurance' THEN 'legal'
      WHEN 'training' THEN 'hr'
      WHEN 'real_estate' THEN 'legal'
      ELSE 'it'
    END
  FROM public.assets a
  JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id
    AND a.expiry_date IS NOT NULL
    AND a.expiry_date <= CURRENT_DATE + _days_ahead

  UNION ALL
  -- Vehicle: test
  SELECT a.id, a.asset_name, a.asset_code, c.id, c.category_name, c.prefix, c.is_assignable,
    'vehicle_test', a.id, 'test_expiry', 'תוקף טסט',
    a.test_expiry, (a.test_expiry - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name, a.custom_fields,
    'vehicle', 'vehicle_test', 'operations'
  FROM public.assets a JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id AND c.protocol_type = 'vehicle'
    AND a.test_expiry IS NOT NULL AND a.test_expiry <= CURRENT_DATE + _days_ahead

  UNION ALL
  -- Vehicle: insurance
  SELECT a.id, a.asset_name, a.asset_code, c.id, c.category_name, c.prefix, c.is_assignable,
    'vehicle_insurance', a.id, 'insurance_expiry', 'תוקף ביטוח',
    a.insurance_expiry, (a.insurance_expiry - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name, a.custom_fields,
    'vehicle', 'vehicle_insurance', 'operations'
  FROM public.assets a JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id AND c.protocol_type = 'vehicle'
    AND a.insurance_expiry IS NOT NULL AND a.insurance_expiry <= CURRENT_DATE + _days_ahead

  UNION ALL
  -- Vehicle: license
  SELECT a.id, a.asset_name, a.asset_code, c.id, c.category_name, c.prefix, c.is_assignable,
    'vehicle_license', a.id, 'license_expiry', 'תוקף רישוי',
    a.license_expiry, (a.license_expiry - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name, a.custom_fields,
    'vehicle', 'vehicle_license', 'operations'
  FROM public.assets a JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id AND c.protocol_type = 'vehicle'
    AND a.license_expiry IS NOT NULL AND a.license_expiry <= CURRENT_DATE + _days_ahead

  UNION ALL
  -- Digital access (asset-based): password
  SELECT a.id, a.asset_name, a.asset_code, c.id, c.category_name, c.prefix, c.is_assignable,
    'digital_access', a.id, 'password_expires_at', 'תפוגת סיסמה',
    a.password_expires_at, (a.password_expires_at - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name, a.custom_fields,
    'digital', 'password_expiry', 'it'
  FROM public.assets a JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id AND c.protocol_type = 'digital'
    AND a.password_expires_at IS NOT NULL AND a.password_expires_at <= CURRENT_DATE + _days_ahead

  UNION ALL
  -- Digital access (asset-based): license
  SELECT a.id, a.asset_name, a.asset_code, c.id, c.category_name, c.prefix, c.is_assignable,
    'digital_access', a.id, 'license_expires_at', 'תפוגת רישיון',
    a.license_expires_at, (a.license_expires_at - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name, a.custom_fields,
    'digital', 'license_expiry', 'it'
  FROM public.assets a JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id AND c.protocol_type = 'digital'
    AND a.license_expires_at IS NOT NULL AND a.license_expires_at <= CURRENT_DATE + _days_ahead

  UNION ALL
  -- Digital access table: password
  SELECT NULL::uuid, da.access_type, COALESCE(da.resource_path,''),
    NULL::uuid, 'גישה דיגיטלית', 'DA', false,
    'digital_access', da.id, 'password_expires_at', 'תפוגת סיסמה',
    da.password_expires_at, (da.password_expires_at - CURRENT_DATE)::int,
    da.employee_id, e.full_name, NULL::jsonb,
    'digital', 'password_expiry', 'it'
  FROM public.digital_access da
  LEFT JOIN public.employees e ON e.id = da.employee_id
  WHERE da.company_id = _company_id
    AND da.password_expires_at IS NOT NULL
    AND da.password_expires_at <= CURRENT_DATE + _days_ahead

  UNION ALL
  -- Digital access table: license
  SELECT NULL::uuid, da.access_type, COALESCE(da.resource_path,''),
    NULL::uuid, 'גישה דיגיטלית', 'DA', false,
    'digital_access', da.id, 'license_expires_at', 'תפוגת רישיון',
    da.license_expires_at, (da.license_expires_at - CURRENT_DATE)::int,
    da.employee_id, e.full_name, NULL::jsonb,
    'digital', 'license_expiry', 'it'
  FROM public.digital_access da
  LEFT JOIN public.employees e ON e.id = da.employee_id
  WHERE da.company_id = _company_id
    AND da.license_expires_at IS NOT NULL
    AND da.license_expires_at <= CURRENT_DATE + _days_ahead

  UNION ALL
  -- Asset documents expiry
  SELECT a.id, a.asset_name, a.asset_code, c.id, c.category_name, c.prefix, c.is_assignable,
    'document', d.id, 'document', COALESCE(d.document_label, d.document_type),
    d.expiry_date, (d.expiry_date - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name, a.custom_fields,
    COALESCE(c.protocol_type::text, 'physical'), 'document_expiry',
    CASE c.protocol_type::text WHEN 'vehicle' THEN 'operations' WHEN 'insurance' THEN 'legal' WHEN 'training' THEN 'hr' WHEN 'real_estate' THEN 'legal' ELSE 'it' END
  FROM public.asset_documents d
  JOIN public.assets a ON a.id = d.asset_id
  JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE d.company_id = _company_id
    AND d.expiry_date IS NOT NULL
    AND d.expiry_date <= CURRENT_DATE + _days_ahead

  ORDER BY 12 ASC NULLS LAST;
$$;
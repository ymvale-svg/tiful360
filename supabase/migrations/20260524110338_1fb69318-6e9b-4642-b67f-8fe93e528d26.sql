-- Vehicle-specific columns on assets (hybrid model: domain columns for fixed fields)
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS license_plate text,
  ADD COLUMN IF NOT EXISTS vehicle_type text,
  ADD COLUMN IF NOT EXISTS fuel_type text,
  ADD COLUMN IF NOT EXISTS year_of_manufacture integer,
  ADD COLUMN IF NOT EXISTS current_km integer,
  ADD COLUMN IF NOT EXISTS test_expiry date,
  ADD COLUMN IF NOT EXISTS insurance_expiry date,
  ADD COLUMN IF NOT EXISTS license_expiry date,
  ADD COLUMN IF NOT EXISTS insurance_company text,
  ADD COLUMN IF NOT EXISTS insurance_policy_number text;

CREATE INDEX IF NOT EXISTS idx_assets_license_plate ON public.assets(license_plate) WHERE license_plate IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_test_expiry ON public.assets(test_expiry) WHERE test_expiry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_insurance_expiry ON public.assets(insurance_expiry) WHERE insurance_expiry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_license_expiry ON public.assets(license_expiry) WHERE license_expiry IS NOT NULL;

-- Auto-migrate existing vehicle data from custom_fields → domain columns
UPDATE public.assets a
SET
  license_plate = COALESCE(a.license_plate, NULLIF(a.custom_fields->>'license_plate', ''), NULLIF(a.custom_fields->>'מספר רישוי', ''), NULLIF(a.custom_fields->>'לוחית רישוי', '')),
  test_expiry = COALESCE(a.test_expiry,
    CASE WHEN (a.custom_fields->>'test_expiry') ~ '^\d{4}-\d{2}-\d{2}$' THEN (a.custom_fields->>'test_expiry')::date
         WHEN (a.custom_fields->>'תוקף טסט') ~ '^\d{4}-\d{2}-\d{2}$' THEN (a.custom_fields->>'תוקף טסט')::date
         WHEN (a.custom_fields->>'טסט') ~ '^\d{4}-\d{2}-\d{2}$' THEN (a.custom_fields->>'טסט')::date
    END),
  insurance_expiry = COALESCE(a.insurance_expiry,
    CASE WHEN (a.custom_fields->>'insurance_expiry') ~ '^\d{4}-\d{2}-\d{2}$' THEN (a.custom_fields->>'insurance_expiry')::date
         WHEN (a.custom_fields->>'תוקף ביטוח') ~ '^\d{4}-\d{2}-\d{2}$' THEN (a.custom_fields->>'תוקף ביטוח')::date
         WHEN (a.custom_fields->>'ביטוח') ~ '^\d{4}-\d{2}-\d{2}$' THEN (a.custom_fields->>'ביטוח')::date
    END),
  license_expiry = COALESCE(a.license_expiry,
    CASE WHEN (a.custom_fields->>'license_expiry') ~ '^\d{4}-\d{2}-\d{2}$' THEN (a.custom_fields->>'license_expiry')::date
         WHEN (a.custom_fields->>'תוקף רישוי') ~ '^\d{4}-\d{2}-\d{2}$' THEN (a.custom_fields->>'תוקף רישוי')::date
         WHEN (a.custom_fields->>'רישוי') ~ '^\d{4}-\d{2}-\d{2}$' THEN (a.custom_fields->>'רישוי')::date
    END),
  current_km = COALESCE(a.current_km,
    NULLIF(regexp_replace(COALESCE(a.custom_fields->>'current_km', a.custom_fields->>'קילומטראז', a.custom_fields->>'ק"מ', ''), '[^0-9]', '', 'g'), '')::integer
  )
FROM public.asset_categories c
WHERE a.category_id = c.id
  AND c.protocol_type = 'vehicle';

-- Extend get_expiring_assets to surface vehicle-domain expiries from new columns
CREATE OR REPLACE FUNCTION public.get_expiring_assets(_company_id uuid, _days_ahead integer DEFAULT 14)
 RETURNS TABLE(asset_id uuid, asset_name text, asset_code text, category_id uuid, category_name text, category_prefix text, is_assignable boolean, source_type text, source_id uuid, field_key text, field_label text, expiry_date date, days_left integer, current_owner_id uuid, owner_name text, custom_fields jsonb, domain text, expiry_type text, assignee_role text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR _company_id IN (SELECT public.user_company_ids(auth.uid()))) THEN
    RETURN;
  END IF;

  RETURN QUERY
  -- Generic expiry_date
  SELECT
    a.id, a.asset_name, a.asset_code,
    c.id, c.category_name, c.prefix, c.is_assignable,
    'asset'::text, a.id, NULL::text, 'תאריך תפוגה'::text,
    a.expiry_date,
    (a.expiry_date - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name,
    a.custom_fields,
    c.protocol_type::text,
    'main'::text,
    CASE c.protocol_type
      WHEN 'vehicle' THEN 'operations' WHEN 'digital' THEN 'it' WHEN 'license' THEN 'it'
      WHEN 'insurance' THEN 'legal' WHEN 'training' THEN 'hr' WHEN 'real_estate' THEN 'legal'
      ELSE 'it' END
  FROM public.assets a
  JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id
    AND a.expiry_date IS NOT NULL
    AND a.expiry_date - CURRENT_DATE <= _days_ahead

  UNION ALL
  -- Vehicle: test
  SELECT a.id, a.asset_name, a.asset_code, c.id, c.category_name, c.prefix, c.is_assignable,
    'vehicle_test'::text, a.id, 'test_expiry'::text, 'תוקף טסט'::text,
    a.test_expiry, (a.test_expiry - CURRENT_DATE)::int, a.current_owner_id, e.full_name,
    a.custom_fields, 'vehicle'::text, 'test'::text, 'operations'::text
  FROM public.assets a
  JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id AND c.protocol_type = 'vehicle'
    AND a.test_expiry IS NOT NULL AND (a.test_expiry - CURRENT_DATE) <= _days_ahead

  UNION ALL
  -- Vehicle: insurance
  SELECT a.id, a.asset_name, a.asset_code, c.id, c.category_name, c.prefix, c.is_assignable,
    'vehicle_insurance'::text, a.id, 'insurance_expiry'::text, 'תוקף ביטוח'::text,
    a.insurance_expiry, (a.insurance_expiry - CURRENT_DATE)::int, a.current_owner_id, e.full_name,
    a.custom_fields, 'vehicle'::text, 'insurance'::text, 'operations'::text
  FROM public.assets a
  JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id AND c.protocol_type = 'vehicle'
    AND a.insurance_expiry IS NOT NULL AND (a.insurance_expiry - CURRENT_DATE) <= _days_ahead

  UNION ALL
  -- Vehicle: license
  SELECT a.id, a.asset_name, a.asset_code, c.id, c.category_name, c.prefix, c.is_assignable,
    'vehicle_license'::text, a.id, 'license_expiry'::text, 'תוקף רישוי'::text,
    a.license_expiry, (a.license_expiry - CURRENT_DATE)::int, a.current_owner_id, e.full_name,
    a.custom_fields, 'vehicle'::text, 'license'::text, 'operations'::text
  FROM public.assets a
  JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id AND c.protocol_type = 'vehicle'
    AND a.license_expiry IS NOT NULL AND (a.license_expiry - CURRENT_DATE) <= _days_ahead

  UNION ALL
  -- Custom expiry fields
  SELECT a.id, a.asset_name, a.asset_code, c.id, c.category_name, c.prefix, c.is_assignable,
    'custom_field'::text, a.id, cf.id::text || ':' || cf.field_name, cf.field_name,
    (a.custom_fields->>cf.field_name)::date,
    ((a.custom_fields->>cf.field_name)::date - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name, a.custom_fields,
    c.protocol_type::text, cf.field_name,
    CASE c.protocol_type
      WHEN 'vehicle' THEN 'operations' WHEN 'digital' THEN 'it' WHEN 'license' THEN 'it'
      WHEN 'insurance' THEN 'legal' WHEN 'training' THEN 'hr' WHEN 'real_estate' THEN 'legal'
      ELSE 'it' END
  FROM public.assets a
  JOIN public.asset_categories c ON c.id = a.category_id
  JOIN public.category_fields cf ON cf.category_id = c.id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id
    AND cf.is_expiry_field = true AND cf.field_type = 'date'::field_type
    AND a.custom_fields ? cf.field_name
    AND (a.custom_fields->>cf.field_name) ~ '^\d{4}-\d{2}-\d{2}$'
    AND ((a.custom_fields->>cf.field_name)::date - CURRENT_DATE) <= _days_ahead

  UNION ALL
  -- Document expiries
  SELECT a.id, a.asset_name, a.asset_code, c.id, c.category_name, c.prefix, c.is_assignable,
    'document'::text, d.id, d.document_type, COALESCE(d.document_label, d.file_name),
    d.expiry_date, (d.expiry_date - CURRENT_DATE)::int, a.current_owner_id, e.full_name,
    a.custom_fields, c.protocol_type::text, 'document'::text,
    CASE c.protocol_type
      WHEN 'vehicle' THEN 'operations' WHEN 'digital' THEN 'it' WHEN 'license' THEN 'it'
      WHEN 'insurance' THEN 'legal' WHEN 'training' THEN 'hr' WHEN 'real_estate' THEN 'legal'
      ELSE 'it' END
  FROM public.asset_documents d
  JOIN public.assets a ON a.id = d.asset_id
  JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE d.company_id = _company_id
    AND d.expiry_date IS NOT NULL AND (d.expiry_date - CURRENT_DATE) <= _days_ahead

  UNION ALL
  -- Digital access: password
  SELECT da.id, da.access_type, COALESCE(da.resource_path, da.access_type),
    NULL::uuid, 'גישות דיגיטליות'::text, 'DACC'::text, true,
    'digital_access'::text, da.id, 'password'::text, 'תפוגת סיסמה'::text,
    da.password_expires_at, (da.password_expires_at - CURRENT_DATE)::int,
    da.employee_id, e.full_name, NULL::jsonb,
    'digital'::text, 'password'::text, 'it'::text
  FROM public.digital_access da
  LEFT JOIN public.employees e ON e.id = da.employee_id
  WHERE da.company_id = _company_id
    AND da.password_expires_at IS NOT NULL
    AND (da.password_expires_at - CURRENT_DATE) <= _days_ahead

  UNION ALL
  -- Digital access: license
  SELECT da.id, da.access_type, COALESCE(da.resource_path, da.access_type),
    NULL::uuid, 'גישות דיגיטליות'::text, 'DACC'::text, true,
    'digital_access'::text, da.id, 'license'::text, 'תפוגת רישיון'::text,
    da.license_expires_at, (da.license_expires_at - CURRENT_DATE)::int,
    da.employee_id, e.full_name, NULL::jsonb,
    'digital'::text, 'license'::text, 'it'::text
  FROM public.digital_access da
  LEFT JOIN public.employees e ON e.id = da.employee_id
  WHERE da.company_id = _company_id
    AND da.license_expires_at IS NOT NULL
    AND (da.license_expires_at - CURRENT_DATE) <= _days_ahead

  ORDER BY 12 ASC NULLS LAST;
END;
$function$;
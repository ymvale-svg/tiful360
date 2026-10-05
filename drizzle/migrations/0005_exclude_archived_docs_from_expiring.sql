CREATE OR REPLACE FUNCTION public.get_expiring_assets(_company_id uuid, _days_ahead integer DEFAULT 14)
 RETURNS TABLE(asset_id uuid, asset_name text, asset_code text, category_id uuid, category_name text, category_prefix text, is_assignable boolean, source_type text, source_id uuid, field_key text, field_label text, expiry_date date, days_left integer, current_owner_id uuid, owner_name text, custom_fields jsonb, domain text, expiry_type text, assignee_role text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _jwt_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF NOT (
    _jwt_role = 'service_role'
    OR current_user IN ('postgres','supabase_admin','service_role')
    OR public.is_super_admin(auth.uid())
    OR _company_id IN (SELECT public.user_company_ids(auth.uid()))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id, a.asset_name, a.asset_code,
    c.id, c.category_name, c.prefix, c.is_assignable,
    'asset'::text, a.id, NULL::text, 'תפוגה'::text,
    a.expiry_date, (a.expiry_date - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name, a.custom_fields,
    COALESCE(c.protocol_type::text, 'physical'), 'asset_expiry'::text,
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
    AND d.is_archived = false
    AND d.expiry_date IS NOT NULL
    AND d.expiry_date <= CURRENT_DATE + _days_ahead

  ORDER BY 12 ASC NULLS LAST;
END;
$function$;
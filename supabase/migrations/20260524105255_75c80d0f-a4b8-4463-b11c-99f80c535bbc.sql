
-- 1. Domain enum
DO $$ BEGIN
  CREATE TYPE public.protocol_domain AS ENUM ('physical','vehicle','digital','license','insurance','training','real_estate');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. asset_categories.protocol_type
ALTER TABLE public.asset_categories
  ADD COLUMN IF NOT EXISTS protocol_type public.protocol_domain NOT NULL DEFAULT 'physical';

UPDATE public.asset_categories SET protocol_type = 'vehicle'
  WHERE protocol_type = 'physical' AND category_name ~* 'רכב|כלי רכב';
UPDATE public.asset_categories SET protocol_type = 'digital'
  WHERE protocol_type = 'physical' AND (prefix = 'DACC' OR category_name ~* 'גישה|חשבון|דיגיטל');
UPDATE public.asset_categories SET protocol_type = 'license'
  WHERE protocol_type = 'physical' AND category_name ~* 'רישיון|רשיון|license';
UPDATE public.asset_categories SET protocol_type = 'insurance'
  WHERE protocol_type = 'physical' AND category_name ~* 'ביטוח|insurance';
UPDATE public.asset_categories SET protocol_type = 'training'
  WHERE protocol_type = 'physical' AND category_name ~* 'הדרכה|תעוד|הסמכ';
UPDATE public.asset_categories SET protocol_type = 'real_estate'
  WHERE protocol_type = 'physical' AND (prefix = 'LEASE' OR category_name ~* 'נדל|נכס מקרק|שכיר|מושכ');

-- 3. category_fields.is_expiry_field
ALTER TABLE public.category_fields
  ADD COLUMN IF NOT EXISTS is_expiry_field boolean NOT NULL DEFAULT false;

UPDATE public.category_fields
  SET is_expiry_field = true
  WHERE field_type = 'date'
    AND field_name ~* 'תפוגה|תוקף|טסט|ביטוח|טיפול|רישיון|חוזה|סיסמ'
    AND field_name !~* 'תחיל|התחל|התחי|start|רכיש|הנפק|נטיע|הוצא|הקמה|פתיח';

-- 4. digital_access expiry columns
ALTER TABLE public.digital_access
  ADD COLUMN IF NOT EXISTS password_expires_at date,
  ADD COLUMN IF NOT EXISTS license_expires_at date;

-- 5. Replace get_expiring_assets (drop first — return type changes)
DROP FUNCTION IF EXISTS public.get_expiring_assets(uuid, integer);

CREATE FUNCTION public.get_expiring_assets(_company_id uuid, _days_ahead integer DEFAULT 14)
RETURNS TABLE(
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR _company_id IN (SELECT public.user_company_ids(auth.uid()))) THEN
    RETURN;
  END IF;

  RETURN QUERY
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
      WHEN 'vehicle' THEN 'operations'
      WHEN 'digital' THEN 'it'
      WHEN 'license' THEN 'it'
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
    AND a.expiry_date - CURRENT_DATE <= _days_ahead

  UNION ALL

  SELECT
    a.id, a.asset_name, a.asset_code,
    c.id, c.category_name, c.prefix, c.is_assignable,
    'custom_field'::text, a.id, cf.id::text || ':' || cf.field_name, cf.field_name,
    (a.custom_fields->>cf.field_name)::date,
    ((a.custom_fields->>cf.field_name)::date - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name,
    a.custom_fields,
    c.protocol_type::text,
    cf.field_name,
    CASE c.protocol_type
      WHEN 'vehicle' THEN 'operations'
      WHEN 'digital' THEN 'it'
      WHEN 'license' THEN 'it'
      WHEN 'insurance' THEN 'legal'
      WHEN 'training' THEN 'hr'
      WHEN 'real_estate' THEN 'legal'
      ELSE 'it'
    END
  FROM public.assets a
  JOIN public.asset_categories c ON c.id = a.category_id
  JOIN public.category_fields cf ON cf.category_id = c.id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id
    AND cf.is_expiry_field = true
    AND cf.field_type = 'date'::field_type
    AND a.custom_fields ? cf.field_name
    AND (a.custom_fields->>cf.field_name) ~ '^\d{4}-\d{2}-\d{2}$'
    AND ((a.custom_fields->>cf.field_name)::date - CURRENT_DATE) <= _days_ahead

  UNION ALL

  SELECT
    a.id, a.asset_name, a.asset_code,
    c.id, c.category_name, c.prefix, c.is_assignable,
    'document'::text, d.id, d.document_type,
    COALESCE(d.document_label, d.file_name),
    d.expiry_date,
    (d.expiry_date - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name,
    a.custom_fields,
    c.protocol_type::text,
    'document'::text,
    CASE c.protocol_type
      WHEN 'vehicle' THEN 'operations'
      WHEN 'digital' THEN 'it'
      WHEN 'license' THEN 'it'
      WHEN 'insurance' THEN 'legal'
      WHEN 'training' THEN 'hr'
      WHEN 'real_estate' THEN 'legal'
      ELSE 'it'
    END
  FROM public.asset_documents d
  JOIN public.assets a ON a.id = d.asset_id
  JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE d.company_id = _company_id
    AND d.expiry_date IS NOT NULL
    AND (d.expiry_date - CURRENT_DATE) <= _days_ahead

  UNION ALL

  SELECT
    da.id,
    da.access_type,
    COALESCE(da.resource_path, da.access_type),
    NULL::uuid, 'גישות דיגיטליות'::text, 'DACC'::text, true,
    'digital_access'::text, da.id, 'password'::text, 'תפוגת סיסמה'::text,
    da.password_expires_at,
    (da.password_expires_at - CURRENT_DATE)::int,
    da.employee_id, e.full_name,
    NULL::jsonb,
    'digital'::text, 'password'::text, 'it'::text
  FROM public.digital_access da
  LEFT JOIN public.employees e ON e.id = da.employee_id
  WHERE da.company_id = _company_id
    AND da.password_expires_at IS NOT NULL
    AND (da.password_expires_at - CURRENT_DATE) <= _days_ahead

  UNION ALL

  SELECT
    da.id,
    da.access_type,
    COALESCE(da.resource_path, da.access_type),
    NULL::uuid, 'גישות דיגיטליות'::text, 'DACC'::text, true,
    'digital_access'::text, da.id, 'license'::text, 'תפוגת רישיון'::text,
    da.license_expires_at,
    (da.license_expires_at - CURRENT_DATE)::int,
    da.employee_id, e.full_name,
    NULL::jsonb,
    'digital'::text, 'license'::text, 'it'::text
  FROM public.digital_access da
  LEFT JOIN public.employees e ON e.id = da.employee_id
  WHERE da.company_id = _company_id
    AND da.license_expires_at IS NOT NULL
    AND (da.license_expires_at - CURRENT_DATE) <= _days_ahead

  ORDER BY 12 ASC NULLS LAST;
END;
$$;

-- 6. Unified employee holdings
CREATE OR REPLACE FUNCTION public.get_employee_holdings(_employee_id uuid)
RETURNS TABLE(
  domain text,
  item_id uuid,
  display_name text,
  display_code text,
  category_name text,
  status text,
  assigned_at timestamp with time zone,
  expiry_date date,
  expiry_label text,
  icon text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.employees WHERE id = _employee_id;
  IF v_company IS NULL THEN RETURN; END IF;

  IF NOT (
    public.is_super_admin(auth.uid())
    OR v_company IN (SELECT public.user_company_ids(auth.uid()))
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = _employee_id AND e.linked_user_id = auth.uid())
    OR public.is_direct_manager_of(_employee_id, auth.uid())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.protocol_type::text,
    a.id,
    a.asset_name,
    a.asset_code,
    c.category_name,
    a.status::text,
    a.updated_at,
    a.expiry_date,
    CASE WHEN a.expiry_date IS NOT NULL THEN 'תאריך תפוגה'::text ELSE NULL::text END,
    c.icon
  FROM public.assets a
  JOIN public.asset_categories c ON c.id = a.category_id
  WHERE a.current_owner_id = _employee_id

  UNION ALL

  SELECT
    'digital'::text,
    da.id,
    da.access_type,
    da.resource_path,
    'גישה דיגיטלית'::text,
    da.status::text,
    da.created_at,
    LEAST(da.password_expires_at, da.license_expires_at),
    CASE
      WHEN da.password_expires_at IS NOT NULL AND (da.license_expires_at IS NULL OR da.password_expires_at <= da.license_expires_at)
        THEN 'תפוגת סיסמה'::text
      WHEN da.license_expires_at IS NOT NULL THEN 'תפוגת רישיון'::text
      ELSE NULL::text
    END,
    'key'::text
  FROM public.digital_access da
  WHERE da.employee_id = _employee_id;
END;
$$;

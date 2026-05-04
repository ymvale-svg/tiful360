
-- 1. Create the Digital Access category for each existing company
INSERT INTO public.asset_categories (company_id, category_name, prefix, icon, description, is_assignable)
SELECT 
  c.id,
  'גישה דיגיטלית',
  'DACC',
  'Key',
  'חשבונות, סיסמאות, רישיונות תוכנה והרשאות מערכת',
  true
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.asset_categories ac 
  WHERE ac.company_id = c.id AND ac.prefix = 'DACC'
);

-- 2. Create custom fields for the new DACC category
WITH dacc_cats AS (
  SELECT id, company_id FROM public.asset_categories WHERE prefix = 'DACC'
)
INSERT INTO public.category_fields (category_id, company_id, field_name, field_type, is_required, field_options, sort_order)
SELECT dc.id, dc.company_id, fld.field_name, fld.field_type::field_type, fld.is_required, fld.field_options, fld.sort_order
FROM dacc_cats dc
CROSS JOIN (VALUES
  ('סוג גישה', 'list', true, '["Email","M365","Google Workspace","VPN","CRM","ERP","שרת קבצים","אפליקציה פנימית","אחר"]'::jsonb, 1),
  ('נתיב/משאב', 'text', true, NULL::jsonb, 2),
  ('רמת הרשאה', 'list', false, '["קריאה","עריכה","מנהל"]'::jsonb, 3),
  ('MFA פעיל', 'list', false, '["כן","לא"]'::jsonb, 4),
  ('תוקף סיסמה', 'date', false, NULL::jsonb, 5),
  ('הערות', 'text', false, NULL::jsonb, 6)
) AS fld(field_name, field_type, is_required, field_options, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.category_fields cf 
  WHERE cf.category_id = dc.id AND cf.field_name = fld.field_name
);

-- 3. Update get_expiring_assets regex to include password expiry keyword
CREATE OR REPLACE FUNCTION public.get_expiring_assets(_company_id uuid, _days_ahead integer DEFAULT 14)
 RETURNS TABLE(asset_id uuid, asset_name text, asset_code text, category_id uuid, category_name text, category_prefix text, is_assignable boolean, source_type text, source_id uuid, field_key text, field_label text, expiry_date date, days_left integer, current_owner_id uuid, owner_name text, custom_fields jsonb)
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
  SELECT
    a.id, a.asset_name, a.asset_code,
    c.id, c.category_name, c.prefix, c.is_assignable,
    'asset'::text, a.id, NULL::text, 'תאריך תפוגה'::text,
    a.expiry_date,
    (a.expiry_date - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name,
    a.custom_fields
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
    a.custom_fields
  FROM public.assets a
  JOIN public.asset_categories c ON c.id = a.category_id
  JOIN public.category_fields cf ON cf.category_id = c.id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id
    AND cf.field_type = 'date'::field_type
    AND cf.field_name ~* 'תפוגה|תוקף|טסט|ביטוח|טיפול|רישיון|חוזה|סיסמ'
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
    a.custom_fields
  FROM public.asset_documents d
  JOIN public.assets a ON a.id = d.asset_id
  JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE d.company_id = _company_id
    AND d.expiry_date IS NOT NULL
    AND (d.expiry_date - CURRENT_DATE) <= _days_ahead

  ORDER BY 11 ASC NULLS LAST;
END;
$function$;

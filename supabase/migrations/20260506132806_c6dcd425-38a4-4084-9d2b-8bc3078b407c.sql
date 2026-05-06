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
    AND cf.field_name !~* 'תחיל|התחל|התחי|start|רכיש|הנפק|נטיע|הוצא|הקמה|פתיח'
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
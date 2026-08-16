CREATE OR REPLACE FUNCTION public.finalize_expired_offboarding()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp RECORD;
  cnt INTEGER := 0;
  snap JSONB;
BEGIN
  FOR emp IN
    SELECT * FROM public.employees
    WHERE end_date IS NOT NULL
      AND end_date < CURRENT_DATE
      AND (status <> 'inactive' OR access_revoked_at IS NULL)
  LOOP
    SELECT jsonb_build_object(
      'assets', COALESCE(jsonb_agg(jsonb_build_object(
        'asset_code', a.asset_code,
        'asset_name', a.asset_name,
        'category', c.category_name,
        'domain', c.protocol_type
      )) FILTER (WHERE a.id IS NOT NULL), '[]'::jsonb),
      'revoked_at', now()
    )
    INTO snap
    FROM public.assets a
    JOIN public.asset_categories c ON c.id = a.category_id
    WHERE a.current_owner_id = emp.id;

    UPDATE public.assets a
    SET current_owner_id = NULL, status = 'in_stock'
    FROM public.asset_categories c
    WHERE c.id = a.category_id
      AND a.current_owner_id = emp.id;

    UPDATE public.digital_access
    SET status = 'blocked', updated_at = now()
    WHERE employee_id = emp.id AND status <> 'blocked';

    UPDATE public.employees
    SET status = 'inactive',
        access_revoked_at = now(),
        offboarding_snapshot = COALESCE(offboarding_snapshot, snap)
    WHERE id = emp.id;

    INSERT INTO public.activity_log (company_id, employee_id, action, details, entity_type, entity_id)
    VALUES (
      emp.company_id,
      emp.id,
      'ניתוק אוטומטי בתום תאריך העזיבה',
      'הגישה למערכת נחסמה, הציוד והחשבונות הדיגיטליים נותקו מהעובד.',
      'employee',
      emp.id
    );

    cnt := cnt + 1;
  END LOOP;

  RETURN cnt;
END;
$function$;

-- Fix rows wrongly marked as "in repair" by the offboarding process
UPDATE public.assets a
SET status = 'in_stock', current_owner_id = NULL
FROM public.asset_categories c
WHERE c.id = a.category_id
  AND a.status = 'in_repair'
  AND (c.protocol_type = 'digital' OR c.prefix = 'DACC');
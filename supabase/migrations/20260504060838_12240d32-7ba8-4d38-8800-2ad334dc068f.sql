
CREATE OR REPLACE FUNCTION public.get_subordinate_employee_ids(_manager_user_id uuid)
RETURNS TABLE(employee_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE subs AS (
    SELECT e.id
    FROM public.employees e
    JOIN public.employees mgr ON mgr.id = e.direct_manager_id
    WHERE mgr.linked_user_id = _manager_user_id
    UNION
    SELECT e.id
    FROM public.employees e
    JOIN subs s ON e.direct_manager_id = s.id
  )
  SELECT id FROM subs;
$$;

CREATE OR REPLACE FUNCTION public.get_live_employee_locations(_company_id uuid)
RETURNS TABLE(
  employee_id uuid,
  full_name text,
  department text,
  role text,
  punch_id uuid,
  punch_at timestamptz,
  direction text,
  lat double precision,
  lng double precision,
  accuracy double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed_all boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF NOT (public.is_super_admin(v_uid) OR _company_id IN (SELECT public.user_company_ids(v_uid))) THEN
    RETURN;
  END IF;

  v_allowed_all := public.is_super_admin(v_uid)
                   OR public.has_role(v_uid, 'admin'::app_role)
                   OR public.is_payroll(v_uid);

  RETURN QUERY
  WITH visible_emps AS (
    SELECT e.id, e.full_name, e.department, e.role
    FROM public.employees e
    WHERE e.company_id = _company_id
      AND e.status = 'active'
      AND (
        v_allowed_all
        OR e.id IN (SELECT s.employee_id FROM public.get_subordinate_employee_ids(v_uid) s)
      )
  ),
  today_punches AS (
    SELECT DISTINCT ON (p.employee_id)
      p.employee_id,
      p.id AS punch_id,
      p.punch_at,
      p.direction,
      (p.raw_payload->'geo'->>'lat')::double precision AS lat,
      (p.raw_payload->'geo'->>'lng')::double precision AS lng,
      (p.raw_payload->'geo'->>'accuracy')::double precision AS accuracy
    FROM public.attendance_punches p
    WHERE p.company_id = _company_id
      AND p.employee_id IN (SELECT id FROM visible_emps)
      AND p.punch_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem'
      AND p.raw_payload ? 'geo'
      AND (p.raw_payload->'geo'->>'lat') IS NOT NULL
    ORDER BY p.employee_id, p.punch_at DESC
  )
  SELECT
    v.id, v.full_name, v.department, v.role,
    tp.punch_id, tp.punch_at, tp.direction, tp.lat, tp.lng, tp.accuracy
  FROM visible_emps v
  JOIN today_punches tp ON tp.employee_id = v.id;
END;
$$;

-- Attendance location report: only employees who punch remotely.
-- An employee is included when remote punching is enabled on the card
-- (employees.can_remote_punch) or when they have a remote (portal) punch in the
-- range, so someone whose permission was turned off still shows for past days.
-- All punches of an included employee are returned (also clock punches), so a
-- day that mixes the clock and the portal still pairs correctly.
CREATE OR REPLACE FUNCTION public.get_attendance_location_report(
  _company_id uuid,
  _from date,
  _to date,
  _employee_id uuid DEFAULT NULL
)
RETURNS TABLE(
  punch_id uuid,
  employee_id uuid,
  full_name text,
  department text,
  employee_code text,
  punch_at timestamptz,
  direction text,
  source text,
  lat double precision,
  lng double precision,
  accuracy double precision,
  geo_address text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'טווח תאריכים לא תקין';
  END IF;
  IF _to - _from > 93 THEN
    RAISE EXCEPTION 'ניתן להפיק דוח לטווח של עד 93 יום';
  END IF;

  v_start := (_from - 1)::timestamp AT TIME ZONE 'Asia/Jerusalem';
  v_end := (_to + 2)::timestamp AT TIME ZONE 'Asia/Jerusalem';

  RETURN QUERY
  WITH remote_emps AS (
    SELECT e.id, e.full_name, e.department, e.employee_code
    FROM public.employees e
    WHERE e.company_id = _company_id
      AND e.id IN (SELECT v.employee_id FROM public.attendance_report_visible_employee_ids(_company_id) v)
      AND (_employee_id IS NULL OR e.id = _employee_id)
      AND (
        e.can_remote_punch
        OR EXISTS (
          SELECT 1 FROM public.attendance_punches r
          WHERE r.company_id = _company_id
            AND r.employee_id = e.id
            AND r.source = 'portal_remote'
            AND r.status <> 'rejected'
            AND r.punch_at >= v_start AND r.punch_at < v_end
        )
      )
  )
  SELECT
    p.id,
    e.id,
    e.full_name,
    e.department,
    e.employee_code,
    p.punch_at,
    p.direction,
    p.source,
    CASE WHEN p.raw_payload->'geo'->>'lat' ~ '^-?[0-9.]+$' THEN (p.raw_payload->'geo'->>'lat')::double precision END,
    CASE WHEN p.raw_payload->'geo'->>'lng' ~ '^-?[0-9.]+$' THEN (p.raw_payload->'geo'->>'lng')::double precision END,
    CASE WHEN p.raw_payload->'geo'->>'accuracy' ~ '^[0-9.]+$' THEN (p.raw_payload->'geo'->>'accuracy')::double precision END,
    p.geo_address
  FROM public.attendance_punches p
  JOIN remote_emps e ON e.id = p.employee_id
  WHERE p.company_id = _company_id
    AND p.status <> 'rejected'
    AND p.punch_at >= v_start
    AND p.punch_at < v_end
  ORDER BY e.full_name, p.employee_id, p.punch_at, p.id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_attendance_location_report(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attendance_location_report(uuid, date, date, uuid) TO authenticated;

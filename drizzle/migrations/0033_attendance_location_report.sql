-- Attendance location report: per employee and day, the time and place of every
-- check-in and check-out. Places are stored as a street address resolved from the
-- punch's GPS point by the reverse-geocode edge function (OpenStreetMap Nominatim).

-- 1. Address resolved from raw_payload->'geo'. NULL = not resolved yet,
--    '' = looked up but no address found (the report then shows coordinates).
ALTER TABLE public.attendance_punches ADD COLUMN IF NOT EXISTS geo_address text;

-- 2. Shared cache of resolved addresses, keyed by the point rounded to 4 decimals
--    (about 11 m), so repeated punches from the same place never call Nominatim twice.
--    Only the service role (the edge function) reads or writes it.
CREATE TABLE IF NOT EXISTS public.geo_address_cache (
  lat_key numeric(8,4) NOT NULL,
  lng_key numeric(8,4) NOT NULL,
  address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lat_key, lng_key)
);
ALTER TABLE public.geo_address_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.geo_address_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.geo_address_cache TO service_role;

-- 3. Which employees the caller may see in attendance reports of a company:
--    super admin, admin, payroll and HR see everyone; others only their subordinates.
CREATE OR REPLACE FUNCTION public.attendance_report_visible_employee_ids(_company_id uuid)
RETURNS TABLE(employee_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  IF NOT (public.is_super_admin(v_uid) OR _company_id IN (SELECT public.user_company_ids(v_uid))) THEN
    RETURN;
  END IF;

  IF public.is_super_admin(v_uid)
     OR public.has_role(v_uid, 'admin'::app_role)
     OR public.is_payroll(v_uid) OR public.is_hr(v_uid) THEN
    RETURN QUERY SELECT e.id FROM public.employees e WHERE e.company_id = _company_id;
  ELSE
    RETURN QUERY
      SELECT e.id FROM public.employees e
      WHERE e.company_id = _company_id
        AND e.id IN (SELECT s.employee_id FROM public.get_subordinate_employee_ids(v_uid) s);
  END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.attendance_report_visible_employee_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attendance_report_visible_employee_ids(uuid) TO authenticated, service_role;

-- 4. The report rows: every non-rejected punch of visible employees between two
--    Israel-time dates (_to inclusive). One extra day is returned on each side so
--    night shifts crossing midnight at either edge pair correctly; the client pairs
--    punches and keeps only shifts whose check-in day is inside the range.
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
BEGIN
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'טווח תאריכים לא תקין';
  END IF;
  IF _to - _from > 93 THEN
    RAISE EXCEPTION 'ניתן להפיק דוח לטווח של עד 93 יום';
  END IF;

  RETURN QUERY
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
  JOIN public.employees e ON e.id = p.employee_id
  WHERE p.company_id = _company_id
    AND p.status <> 'rejected'
    AND p.employee_id IN (SELECT v.employee_id FROM public.attendance_report_visible_employee_ids(_company_id) v)
    AND (_employee_id IS NULL OR p.employee_id = _employee_id)
    AND p.punch_at >= ((_from - 1)::timestamp AT TIME ZONE 'Asia/Jerusalem')
    AND p.punch_at < ((_to + 2)::timestamp AT TIME ZONE 'Asia/Jerusalem')
  ORDER BY e.full_name, p.employee_id, p.punch_at, p.id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_attendance_location_report(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attendance_location_report(uuid, date, date, uuid) TO authenticated;

-- 5. Of the given punches, those the caller may see that have a GPS point and no
--    address yet. The reverse-geocode edge function calls this with the caller's
--    JWT, so it only ever resolves (and writes) punches the caller is allowed to see:
--    the caller's own punches, or punches of employees visible in the report.
CREATE OR REPLACE FUNCTION public.get_punches_missing_address(_punch_ids uuid[])
RETURNS TABLE(punch_id uuid, lat double precision, lng double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR _punch_ids IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id,
         (p.raw_payload->'geo'->>'lat')::double precision,
         (p.raw_payload->'geo'->>'lng')::double precision
  FROM public.attendance_punches p
  JOIN public.employees e ON e.id = p.employee_id
  WHERE p.id = ANY(_punch_ids[1:50])
    AND p.geo_address IS NULL
    AND p.raw_payload->'geo'->>'lat' ~ '^-?[0-9.]+$'
    AND p.raw_payload->'geo'->>'lng' ~ '^-?[0-9.]+$'
    AND (
      e.linked_user_id = v_uid
      OR p.employee_id IN (SELECT v.employee_id FROM public.attendance_report_visible_employee_ids(p.company_id) v)
    );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_punches_missing_address(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_punches_missing_address(uuid[]) TO authenticated;

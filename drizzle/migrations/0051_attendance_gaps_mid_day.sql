CREATE OR REPLACE FUNCTION public.punch_sequence_broken(_directions text[])
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  expect_in boolean := true;
  d text;
BEGIN
  IF _directions IS NULL OR array_length(_directions, 1) IS NULL THEN
    RETURN false;
  END IF;
  FOREACH d IN ARRAY _directions LOOP
    IF d = 'in' AND NOT expect_in THEN RETURN true; END IF;
    IF d = 'out' AND expect_in THEN RETURN true; END IF;
    expect_in := NOT expect_in;
  END LOOP;
  RETURN NOT expect_in;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_attendance_gaps(_company_id uuid, _from date, _to date)
 RETURNS TABLE(employee_id uuid, full_name text, email text, gap_date date, gap_type text, punch_count integer, punch_times text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.is_super_admin(auth.uid())
    OR ((public.has_role(auth.uid(),'admin'::app_role) OR public.is_payroll(auth.uid()))
        AND _company_id IN (SELECT public.user_company_ids(auth.uid())))
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT d::date AS day FROM generate_series(_from, _to, interval '1 day') d
  ),
  emp_days AS (
    SELECT e.id AS employee_id, e.full_name, e.email, d.day
    FROM public.employees e
    CROSS JOIN days d
    WHERE e.company_id = _company_id
      AND e.status = 'active'
      AND e.tracks_attendance = true
      AND (e.start_date IS NULL OR e.start_date <= d.day)
  ),
  filtered AS (
    SELECT ed.*
    FROM emp_days ed
    JOIN public.employees e ON e.id = ed.employee_id
    WHERE EXTRACT(dow FROM ed.day)::smallint = ANY (e.work_days)
      AND NOT EXISTS (
        SELECT 1 FROM public.company_holidays h
        WHERE h.company_id = _company_id AND h.holiday_date = ed.day
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.employee_id = ed.employee_id
          AND lr.status = 'approved'
          AND ed.day BETWEEN lr.start_date AND lr.end_date
      )
  ),
  punches AS (
    SELECT
      f.employee_id, f.full_name, f.email, f.day,
      COUNT(p.id)::int AS cnt,
      string_agg(
        to_char((p.punch_at AT TIME ZONE 'Asia/Jerusalem'), 'HH24:MI') || ' ' ||
        CASE p.direction WHEN 'in' THEN 'כניסה' WHEN 'out' THEN 'יציאה' ELSE '—' END,
        ', ' ORDER BY p.punch_at
      ) AS times,
      array_agg(p.direction ORDER BY p.punch_at) FILTER (WHERE p.id IS NOT NULL) AS dirs
    FROM filtered f
    LEFT JOIN public.attendance_punches p
      ON p.employee_id = f.employee_id
     AND p.company_id = _company_id
     AND p.status <> 'rejected'
     AND (p.punch_at AT TIME ZONE 'Asia/Jerusalem')::date = f.day
    GROUP BY f.employee_id, f.full_name, f.email, f.day
  )
  SELECT
    p.employee_id, p.full_name, p.email, p.day,
    CASE WHEN p.cnt = 0 THEN 'empty' ELSE 'odd' END,
    p.cnt,
    COALESCE(p.times, '')
  FROM punches p
  WHERE p.cnt = 0 OR (p.cnt % 2) = 1 OR public.punch_sequence_broken(p.dirs)
  ORDER BY p.full_name, p.day;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_daily_missing_punches(_target_date date)
 RETURNS TABLE(company_id uuid, company_name text, employee_id uuid, full_name text, email text, gap_type text, punch_count integer, punch_times text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH scheduled AS (
    SELECT e.id AS employee_id, e.full_name, e.email, e.company_id, c.name AS company_name
    FROM public.employees e
    JOIN public.companies c ON c.id = e.company_id
    WHERE e.status = 'active'
      AND e.tracks_attendance = true
      AND COALESCE(e.attendance_notifications_disabled, false) = false
      AND (e.start_date IS NULL OR e.start_date <= _target_date)
      AND EXTRACT(dow FROM _target_date)::smallint = ANY (e.work_days)
      AND NOT EXISTS (
        SELECT 1 FROM public.company_holidays h
        WHERE h.company_id = e.company_id AND h.holiday_date = _target_date
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.employee_id = e.id
          AND lr.status = 'approved'
          AND _target_date BETWEEN lr.start_date AND lr.end_date
      )
  ),
  punches AS (
    SELECT s.employee_id, s.full_name, s.email, s.company_id, s.company_name,
      COUNT(p.id)::int AS cnt,
      string_agg(
        to_char((p.punch_at AT TIME ZONE 'Asia/Jerusalem'), 'HH24:MI') || ' ' ||
        CASE p.direction WHEN 'in' THEN 'כניסה' WHEN 'out' THEN 'יציאה' ELSE '—' END,
        ', ' ORDER BY p.punch_at
      ) AS times,
      array_agg(p.direction ORDER BY p.punch_at) FILTER (WHERE p.id IS NOT NULL) AS dirs
    FROM scheduled s
    LEFT JOIN public.attendance_punches p
      ON p.employee_id = s.employee_id
     AND p.company_id = s.company_id
     AND p.status <> 'rejected'
     AND (p.punch_at AT TIME ZONE 'Asia/Jerusalem')::date = _target_date
    GROUP BY s.employee_id, s.full_name, s.email, s.company_id, s.company_name
  )
  SELECT company_id, company_name, employee_id, full_name, email,
    CASE WHEN cnt = 0 THEN 'empty' ELSE 'odd' END AS gap_type,
    cnt, COALESCE(times, '')
  FROM punches
  WHERE cnt = 0 OR (cnt % 2) = 1 OR public.punch_sequence_broken(dirs)
  ORDER BY company_name, full_name;
$function$;
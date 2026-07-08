
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS attendance_notifications_disabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employees.attendance_notifications_disabled IS
  'When true, this employee is excluded from daily missing-punch email alerts (e.g. remote/field workers using an external app).';

-- Refresh RPC to skip employees with notifications disabled
CREATE OR REPLACE FUNCTION public.get_daily_missing_punches(_target_date date)
RETURNS TABLE(
  company_id uuid,
  company_name text,
  employee_id uuid,
  full_name text,
  email text,
  gap_type text,
  punch_count integer,
  punch_times text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      ) AS times
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
  WHERE cnt = 0 OR (cnt % 2) = 1
  ORDER BY company_name, full_name;
$$;

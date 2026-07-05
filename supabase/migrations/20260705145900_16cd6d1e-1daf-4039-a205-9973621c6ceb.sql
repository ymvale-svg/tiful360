
-- Columns to mark manually-edited punches
ALTER TABLE public.attendance_punches
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by uuid;

-- Admin/payroll direct edit of punch time
CREATE OR REPLACE FUNCTION public.admin_edit_punch_time(_punch_id uuid, _new_punch_at timestamptz)
RETURNS public.attendance_punches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.attendance_punches;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_row FROM public.attendance_punches WHERE id = _punch_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Punch not found'; END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR (
      (public.has_role(v_uid, 'admin'::app_role)
        OR public.is_payroll(v_uid)
        OR public.is_operations(v_uid))
      AND v_row.company_id IN (SELECT public.user_company_ids(v_uid))
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_punches
  SET punch_at = _new_punch_at,
      status = 'approved',
      edited_at = now(),
      edited_by = v_uid,
      raw_payload = COALESCE(raw_payload, '{}'::jsonb) ||
        jsonb_build_object('manual_edit', jsonb_build_object(
          'previous_punch_at', v_row.punch_at,
          'edited_at', now(),
          'edited_by', v_uid,
          'edited_by_role', 'admin'
        ))
  WHERE id = _punch_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Employee self-edit with rules:
--   • allowed until end of the day AFTER the punch date (IL time)
--   • OR within current month with at most 3 self-edits already
CREATE OR REPLACE FUNCTION public.edit_own_punch_time(_punch_id uuid, _new_punch_at timestamptz)
RETURNS public.attendance_punches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_emp uuid;
  v_row public.attendance_punches;
  v_punch_date date;
  v_today date;
  v_within_grace boolean;
  v_month_edits integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_row FROM public.attendance_punches WHERE id = _punch_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'הפעימה לא נמצאה'; END IF;

  SELECT id INTO v_emp FROM public.employees
    WHERE id = v_row.employee_id AND linked_user_id = v_uid;
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'לא ניתן לערוך פעימה שאינה שלך' USING ERRCODE = '42501';
  END IF;

  v_punch_date := (v_row.punch_at AT TIME ZONE 'Asia/Jerusalem')::date;
  v_today := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  v_within_grace := v_today <= v_punch_date + 1;

  IF NOT v_within_grace THEN
    -- Must be same month & fewer than 3 self edits this month
    IF date_trunc('month', v_punch_date) <> date_trunc('month', v_today) THEN
      RAISE EXCEPTION 'לא ניתן לערוך פעימה מחודש קודם';
    END IF;

    SELECT count(*) INTO v_month_edits
    FROM public.attendance_punches
    WHERE employee_id = v_emp
      AND edited_by = v_uid
      AND edited_at >= date_trunc('month', (now() AT TIME ZONE 'Asia/Jerusalem'))::timestamptz;

    IF v_month_edits >= 3 THEN
      RAISE EXCEPTION 'ניצלת 3 תיקוני נוכחות עצמיים החודש. פנה למנהל';
    END IF;
  END IF;

  -- Enforce: new time must stay in same IL calendar day as original punch
  IF (_new_punch_at AT TIME ZONE 'Asia/Jerusalem')::date <> v_punch_date THEN
    RAISE EXCEPTION 'ניתן לשנות רק שעה, לא תאריך';
  END IF;

  UPDATE public.attendance_punches
  SET punch_at = _new_punch_at,
      status = 'approved',
      edited_at = now(),
      edited_by = v_uid,
      raw_payload = COALESCE(raw_payload, '{}'::jsonb) ||
        jsonb_build_object('manual_edit', jsonb_build_object(
          'previous_punch_at', v_row.punch_at,
          'edited_at', now(),
          'edited_by', v_uid,
          'edited_by_role', 'employee_self'
        ))
  WHERE id = _punch_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- How many self-edits the current employee used this IL month
CREATE OR REPLACE FUNCTION public.my_self_edit_count_this_month()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int
  FROM public.attendance_punches p
  JOIN public.employees e ON e.id = p.employee_id AND e.linked_user_id = auth.uid()
  WHERE p.edited_by = auth.uid()
    AND p.edited_at >= date_trunc('month', (now() AT TIME ZONE 'Asia/Jerusalem'))::timestamptz;
$$;

-- Daily missing punches across ALL companies (service-role callable, no auth.uid()).
-- Returns employees whose scheduled work-day had zero punches OR only a single (odd) punch.
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

GRANT EXECUTE ON FUNCTION public.admin_edit_punch_time(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_own_punch_time(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_self_edit_count_this_month() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_missing_punches(date) TO service_role;

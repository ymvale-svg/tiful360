
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS work_days smallint[] NOT NULL DEFAULT '{0,1,2,3,4}'::smallint[];

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS attendance_corrections_auto_approve boolean NOT NULL DEFAULT false;

ALTER TABLE public.attendance_corrections
  ADD COLUMN IF NOT EXISTS applied_at timestamptz NULL;

CREATE TABLE IF NOT EXISTS public.company_holidays (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, holiday_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_holidays TO authenticated;
GRANT ALL ON public.company_holidays TO service_role;

ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members view holidays" ON public.company_holidays;
CREATE POLICY "Company members view holidays" ON public.company_holidays
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Payroll/admin manage holidays" ON public.company_holidays;
CREATE POLICY "Payroll/admin manage holidays" ON public.company_holidays
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR ((public.has_role(auth.uid(),'admin'::app_role) OR public.is_payroll(auth.uid()))
        AND company_id IN (SELECT public.user_company_ids(auth.uid())))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR ((public.has_role(auth.uid(),'admin'::app_role) OR public.is_payroll(auth.uid()))
        AND company_id IN (SELECT public.user_company_ids(auth.uid())))
  );

CREATE INDEX IF NOT EXISTS idx_company_holidays_company_date
  ON public.company_holidays (company_id, holiday_date);

CREATE OR REPLACE FUNCTION public.get_attendance_gaps(_company_id uuid, _from date, _to date)
RETURNS TABLE(
  employee_id uuid,
  full_name text,
  email text,
  gap_date date,
  gap_type text,
  punch_count int,
  punch_times text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
      ) AS times
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
  WHERE p.cnt = 0 OR (p.cnt % 2) = 1
  ORDER BY p.full_name, p.day;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_attendance_correction(_correction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.attendance_corrections;
  v_emp_code text;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_punch_in timestamptz;
  v_punch_out timestamptz;
BEGIN
  SELECT * INTO c FROM public.attendance_corrections WHERE id = _correction_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Correction not found'; END IF;
  IF c.status <> 'approved' THEN RETURN; END IF;
  IF c.applied_at IS NOT NULL THEN RETURN; END IF;

  SELECT COALESCE(employee_code, id::text) INTO v_emp_code
  FROM public.employees WHERE id = c.employee_id;

  v_day_start := (c.correction_date::timestamp AT TIME ZONE 'Asia/Jerusalem');
  v_day_end := v_day_start + interval '1 day';

  IF c.requested_check_in IS NOT NULL THEN
    DELETE FROM public.attendance_punches
    WHERE employee_id = c.employee_id
      AND company_id = c.company_id
      AND direction = 'in'
      AND punch_at >= v_day_start AND punch_at < v_day_end
      AND COALESCE(source,'') <> 'portal_remote';

    v_punch_in := ((c.correction_date::text || ' ' || c.requested_check_in::text)::timestamp AT TIME ZONE 'Asia/Jerusalem');

    INSERT INTO public.attendance_punches
      (company_id, employee_id, employee_code_raw, punch_at, direction, source, status, raw_payload)
    VALUES
      (c.company_id, c.employee_id, v_emp_code, v_punch_in, 'in', 'correction', 'approved',
       jsonb_build_object('correction_id', c.id, 'applied_at', now()))
    ON CONFLICT DO NOTHING;
  END IF;

  IF c.requested_check_out IS NOT NULL THEN
    DELETE FROM public.attendance_punches
    WHERE employee_id = c.employee_id
      AND company_id = c.company_id
      AND direction = 'out'
      AND punch_at >= v_day_start AND punch_at < v_day_end
      AND COALESCE(source,'') <> 'portal_remote';

    v_punch_out := ((c.correction_date::text || ' ' || c.requested_check_out::text)::timestamp AT TIME ZONE 'Asia/Jerusalem');

    INSERT INTO public.attendance_punches
      (company_id, employee_id, employee_code_raw, punch_at, direction, source, status, raw_payload)
    VALUES
      (c.company_id, c.employee_id, v_emp_code, v_punch_out, 'out', 'correction', 'approved',
       jsonb_build_object('correction_id', c.id, 'applied_at', now()))
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.attendance_corrections
  SET applied_at = now()
  WHERE id = _correction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_attendance_correction(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.apply_attendance_correction(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_attendance_correction(uuid) TO service_role;

-- Trigger functions
CREATE OR REPLACE FUNCTION public.attendance_correction_before_insert_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auto boolean;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT attendance_corrections_auto_approve INTO v_auto
    FROM public.companies WHERE id = NEW.company_id;
    IF COALESCE(v_auto, false) THEN
      NEW.status := 'approved';
      NEW.reviewed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.attendance_correction_after_approve_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.applied_at IS NULL THEN
    PERFORM public.apply_attendance_correction(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_correction_before_insert ON public.attendance_corrections;
CREATE TRIGGER attendance_correction_before_insert
BEFORE INSERT ON public.attendance_corrections
FOR EACH ROW EXECUTE FUNCTION public.attendance_correction_before_insert_fn();

DROP TRIGGER IF EXISTS attendance_correction_after_insert ON public.attendance_corrections;
CREATE TRIGGER attendance_correction_after_insert
AFTER INSERT ON public.attendance_corrections
FOR EACH ROW
WHEN (NEW.status = 'approved')
EXECUTE FUNCTION public.attendance_correction_after_approve_fn();

DROP TRIGGER IF EXISTS attendance_correction_after_update ON public.attendance_corrections;
CREATE TRIGGER attendance_correction_after_update
AFTER UPDATE ON public.attendance_corrections
FOR EACH ROW
WHEN (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.attendance_correction_after_approve_fn();

-- Seed Israeli holidays for all existing companies
INSERT INTO public.company_holidays (company_id, holiday_date, name)
SELECT c.id, d.holiday_date, d.name FROM public.companies c
CROSS JOIN (VALUES
  ('2025-04-13'::date, 'פסח א'''),
  ('2025-04-19'::date, 'שביעי של פסח'),
  ('2025-05-01'::date, 'יום העצמאות'),
  ('2025-06-02'::date, 'שבועות'),
  ('2025-09-23'::date, 'ראש השנה א'''),
  ('2025-09-24'::date, 'ראש השנה ב'''),
  ('2025-10-02'::date, 'יום כיפור'),
  ('2025-10-07'::date, 'סוכות א'''),
  ('2025-10-14'::date, 'שמיני עצרת/שמחת תורה'),
  ('2026-04-02'::date, 'פסח א'''),
  ('2026-04-08'::date, 'שביעי של פסח'),
  ('2026-04-22'::date, 'יום העצמאות'),
  ('2026-05-22'::date, 'שבועות'),
  ('2026-09-12'::date, 'ראש השנה א'''),
  ('2026-09-13'::date, 'ראש השנה ב'''),
  ('2026-09-21'::date, 'יום כיפור'),
  ('2026-09-26'::date, 'סוכות א'''),
  ('2026-10-03'::date, 'שמיני עצרת/שמחת תורה'),
  ('2027-04-22'::date, 'פסח א'''),
  ('2027-04-28'::date, 'שביעי של פסח'),
  ('2027-05-12'::date, 'יום העצמאות'),
  ('2027-06-11'::date, 'שבועות'),
  ('2027-10-02'::date, 'ראש השנה א'''),
  ('2027-10-03'::date, 'ראש השנה ב'''),
  ('2027-10-11'::date, 'יום כיפור'),
  ('2027-10-16'::date, 'סוכות א'''),
  ('2027-10-23'::date, 'שמיני עצרת/שמחת תורה')
) AS d(holiday_date, name)
ON CONFLICT (company_id, holiday_date) DO NOTHING;

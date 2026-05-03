-- 1) BEFORE INSERT trigger: dedup punches within 5 minutes for same employee
CREATE OR REPLACE FUNCTION public.dedup_punch_5min()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  recent_exists boolean;
BEGIN
  IF NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.attendance_punches
    WHERE employee_id = NEW.employee_id
      AND company_id = NEW.company_id
      AND punch_at >= NEW.punch_at - interval '5 minutes'
      AND punch_at <= NEW.punch_at + interval '5 minutes'
      AND (TG_OP = 'INSERT' OR id <> NEW.id)
  ) INTO recent_exists;

  IF recent_exists THEN
    -- Skip insert silently (duplicate within 5 minutes)
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dedup_punch_5min ON public.attendance_punches;
CREATE TRIGGER trg_dedup_punch_5min
  BEFORE INSERT ON public.attendance_punches
  FOR EACH ROW
  EXECUTE FUNCTION public.dedup_punch_5min();

-- Ensure classification trigger exists (BEFORE INSERT, runs after dedup alphabetically)
DROP TRIGGER IF EXISTS trg_classify_punch_direction ON public.attendance_punches;
CREATE TRIGGER trg_classify_punch_direction
  BEFORE INSERT ON public.attendance_punches
  FOR EACH ROW
  EXECUTE FUNCTION public.classify_punch_direction();

-- 2) Update backfill function: dedup existing rows within 5 min, then reclassify
CREATE OR REPLACE FUNCTION public.classify_existing_punches(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
  prior_count integer;
  day_start timestamptz;
  day_end timestamptz;
  new_dir text;
  updated_count integer := 0;
  prev_punch_at timestamptz;
  prev_employee uuid;
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR _company_id IN (SELECT public.user_company_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Step A: dedup — delete punches within 5 minutes of a prior punch (same employee)
  prev_employee := NULL;
  prev_punch_at := NULL;
  FOR rec IN
    SELECT id, employee_id, punch_at
    FROM public.attendance_punches
    WHERE company_id = _company_id
      AND employee_id IS NOT NULL
      AND source <> 'portal_remote'
    ORDER BY employee_id, punch_at
  LOOP
    IF prev_employee IS NOT NULL
       AND prev_employee = rec.employee_id
       AND rec.punch_at - prev_punch_at <= interval '5 minutes' THEN
      DELETE FROM public.attendance_punches WHERE id = rec.id;
      -- keep prev_* unchanged so a 3rd punch within 5 min of the kept one is also dropped
    ELSE
      prev_employee := rec.employee_id;
      prev_punch_at := rec.punch_at;
    END IF;
  END LOOP;

  -- Step B: reclassify direction based on alternating order per day
  FOR rec IN
    SELECT id, employee_id, company_id, punch_at, direction
    FROM public.attendance_punches
    WHERE company_id = _company_id
      AND employee_id IS NOT NULL
      AND source <> 'portal_remote'
    ORDER BY employee_id, punch_at
  LOOP
    day_start := date_trunc('day', rec.punch_at AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem';
    day_end := day_start + interval '1 day';

    SELECT count(*) INTO prior_count
    FROM public.attendance_punches
    WHERE employee_id = rec.employee_id
      AND company_id = rec.company_id
      AND punch_at >= day_start
      AND punch_at < day_end
      AND punch_at < rec.punch_at
      AND id <> rec.id;

    new_dir := CASE WHEN (prior_count % 2) = 0 THEN 'in' ELSE 'out' END;

    IF rec.direction IS DISTINCT FROM new_dir THEN
      UPDATE public.attendance_punches
      SET direction = new_dir
      WHERE id = rec.id;
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RETURN updated_count;
END;
$$;
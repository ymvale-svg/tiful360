-- 1. Add can_remote_punch to employees
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS can_remote_punch boolean NOT NULL DEFAULT false;

-- 2. Auto-classify direction trigger
CREATE OR REPLACE FUNCTION public.classify_punch_direction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prior_count integer;
  day_start timestamptz;
  day_end timestamptz;
BEGIN
  -- Only classify when direction is unknown/null and we have an employee_id
  IF NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.direction IS NOT NULL AND NEW.direction NOT IN ('unknown', '') THEN
    RETURN NEW;
  END IF;

  day_start := date_trunc('day', NEW.punch_at AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem';
  day_end := day_start + interval '1 day';

  SELECT count(*) INTO prior_count
  FROM public.attendance_punches
  WHERE employee_id = NEW.employee_id
    AND company_id = NEW.company_id
    AND punch_at >= day_start
    AND punch_at < day_end
    AND punch_at < NEW.punch_at
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  -- prior_count=0 → this is the 1st of the day → in
  -- prior_count=1 → 2nd → out, etc.
  IF (prior_count % 2) = 0 THEN
    NEW.direction := 'in';
  ELSE
    NEW.direction := 'out';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classify_punch_direction ON public.attendance_punches;
CREATE TRIGGER trg_classify_punch_direction
BEFORE INSERT OR UPDATE OF employee_id, direction, punch_at
ON public.attendance_punches
FOR EACH ROW
EXECUTE FUNCTION public.classify_punch_direction();

-- 3. Backfill function: reclassify all punches in a company
CREATE OR REPLACE FUNCTION public.classify_existing_punches(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  prior_count integer;
  day_start timestamptz;
  day_end timestamptz;
  new_dir text;
  updated_count integer := 0;
BEGIN
  -- Permission: only company members / admins
  IF NOT (public.is_super_admin(auth.uid())
          OR _company_id IN (SELECT public.user_company_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR rec IN
    SELECT id, employee_id, company_id, punch_at, direction, source
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

-- 4. Realtime
ALTER TABLE public.attendance_punches REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'attendance_punches'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_punches';
  END IF;
END $$;
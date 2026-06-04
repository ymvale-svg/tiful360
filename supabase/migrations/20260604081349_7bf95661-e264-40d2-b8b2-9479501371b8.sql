
DO $$ BEGIN
  CREATE TYPE public.birthday_calendar_pref AS ENUM ('gregorian','hebrew');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS birthday_calendar_preference public.birthday_calendar_pref NOT NULL DEFAULT 'gregorian',
  ADD COLUMN IF NOT EXISTS hebrew_birth_day smallint,
  ADD COLUMN IF NOT EXISTS hebrew_birth_month smallint,
  ADD COLUMN IF NOT EXISTS hebrew_birth_year smallint;

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_hebrew_birth_chk;
ALTER TABLE public.employees ADD CONSTRAINT employees_hebrew_birth_chk CHECK (
  (hebrew_birth_day IS NULL OR (hebrew_birth_day BETWEEN 1 AND 30))
  AND (hebrew_birth_month IS NULL OR (hebrew_birth_month BETWEEN 1 AND 13))
  AND (hebrew_birth_year IS NULL OR (hebrew_birth_year BETWEEN 5000 AND 6000))
);

DROP FUNCTION IF EXISTS public.get_company_birthdays(uuid);

CREATE FUNCTION public.get_company_birthdays(_company_id uuid)
RETURNS TABLE(
  id uuid,
  full_name text,
  birth_date date,
  birthday_calendar_preference public.birthday_calendar_pref,
  hebrew_birth_day smallint,
  hebrew_birth_month smallint,
  hebrew_birth_year smallint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT e.id, e.full_name, e.birth_date,
         e.birthday_calendar_preference,
         e.hebrew_birth_day, e.hebrew_birth_month, e.hebrew_birth_year
  FROM public.employees e
  WHERE e.company_id = _company_id
    AND e.status = 'active'
    AND (
      (e.birthday_calendar_preference = 'gregorian' AND e.birth_date IS NOT NULL)
      OR (e.birthday_calendar_preference = 'hebrew'
          AND e.hebrew_birth_day IS NOT NULL
          AND e.hebrew_birth_month IS NOT NULL)
    )
$function$;

CREATE OR REPLACE FUNCTION public.update_my_birthday_preference(
  _preference public.birthday_calendar_pref,
  _hebrew_day smallint DEFAULT NULL,
  _hebrew_month smallint DEFAULT NULL,
  _hebrew_year smallint DEFAULT NULL
)
RETURNS public.employees
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_emp public.employees;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  IF _preference = 'hebrew' AND (_hebrew_day IS NULL OR _hebrew_month IS NULL OR _hebrew_year IS NULL) THEN
    RAISE EXCEPTION 'Hebrew date fields required when preference is hebrew';
  END IF;
  UPDATE public.employees
  SET birthday_calendar_preference = _preference,
      hebrew_birth_day = CASE WHEN _preference = 'hebrew' THEN _hebrew_day ELSE NULL END,
      hebrew_birth_month = CASE WHEN _preference = 'hebrew' THEN _hebrew_month ELSE NULL END,
      hebrew_birth_year = CASE WHEN _preference = 'hebrew' THEN _hebrew_year ELSE NULL END,
      updated_at = now()
  WHERE linked_user_id = v_uid
  RETURNING * INTO v_emp;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'No employee record linked to current user'; END IF;
  RETURN v_emp;
END;
$function$;

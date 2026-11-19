-- Several required columns are normally filled in by the app's own screens.
-- When a record arrives from outside (the open API, an import), those columns are
-- still required, so fill them only when they were left empty. Values written on
-- purpose are never overwritten.

CREATE SEQUENCE IF NOT EXISTS public.employee_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.asset_code_seq;

SELECT setval(
  'public.employee_code_seq',
  COALESCE((SELECT MAX(substr(employee_code, 5)::int) FROM public.employees WHERE employee_code ~ '^EMP-[0-9]+$'), 0) + 1,
  false
);
SELECT setval(
  'public.asset_code_seq',
  COALESCE((SELECT MAX(substr(asset_code, 4)::int) FROM public.assets WHERE asset_code ~ '^AS-[0-9]+$'), 0) + 1,
  false
);

GRANT USAGE, SELECT ON SEQUENCE public.employee_code_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.asset_code_seq TO authenticated;
GRANT ALL ON SEQUENCE public.employee_code_seq TO service_role;
GRANT ALL ON SEQUENCE public.asset_code_seq TO service_role;

CREATE OR REPLACE FUNCTION public.assign_missing_codes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'employees' THEN
    IF NEW.employee_code IS NULL OR btrim(NEW.employee_code) = '' THEN
      NEW.employee_code := 'EMP-' || nextval('public.employee_code_seq');
    END IF;
  ELSIF TG_TABLE_NAME = 'assets' THEN
    IF NEW.asset_code IS NULL OR btrim(NEW.asset_code) = '' THEN
      NEW.asset_code := 'AS-' || nextval('public.asset_code_seq');
    END IF;
  ELSIF TG_TABLE_NAME = 'it_tickets' THEN
    IF NEW.ticket_code IS NULL OR btrim(NEW.ticket_code) = '' THEN
      NEW.ticket_code := 'IT-'
        || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))
        || '-' || lpad((floor(random() * 1000))::int::text, 3, '0');
    END IF;
  ELSIF TG_TABLE_NAME = 'attendance_punches' THEN
    IF NEW.employee_code_raw IS NULL OR btrim(NEW.employee_code_raw) = '' THEN
      SELECT e.employee_code INTO NEW.employee_code_raw
        FROM public.employees e WHERE e.id = NEW.employee_id;
      IF NEW.employee_code_raw IS NULL THEN
        RAISE EXCEPTION 'attendance_punches needs employee_code_raw, or an employee_id that exists';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS employees_assign_missing_code ON public.employees;
CREATE TRIGGER employees_assign_missing_code
  BEFORE INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.assign_missing_codes();

DROP TRIGGER IF EXISTS assets_assign_missing_code ON public.assets;
CREATE TRIGGER assets_assign_missing_code
  BEFORE INSERT ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.assign_missing_codes();

DROP TRIGGER IF EXISTS it_tickets_assign_missing_code ON public.it_tickets;
CREATE TRIGGER it_tickets_assign_missing_code
  BEFORE INSERT ON public.it_tickets
  FOR EACH ROW EXECUTE FUNCTION public.assign_missing_codes();

DROP TRIGGER IF EXISTS attendance_punches_assign_missing_code ON public.attendance_punches;
CREATE TRIGGER attendance_punches_assign_missing_code
  BEFORE INSERT ON public.attendance_punches
  FOR EACH ROW EXECUTE FUNCTION public.assign_missing_codes();
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_email text := lower(coalesce(NEW.email, ''));
  v_employee record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employees) THEN
    INSERT INTO public.profiles (user_id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
    RETURN NEW;
  END IF;

  -- Active employees, and new employees still in onboarding (invited from the setup wizard)
  SELECT * INTO v_employee
  FROM public.employees
  WHERE lower(email) = v_email
    AND status IN ('active', 'onboarding')
  ORDER BY (status = 'active') DESC
  LIMIT 1;

  IF v_employee.id IS NULL THEN
    RAISE EXCEPTION 'משתמש זה אינו מורשה גישה. פנה למנהל המערכת.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.employees SET linked_user_id = NEW.id WHERE id = v_employee.id;

  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', v_employee.full_name, NEW.email))
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee')
  ON CONFLICT DO NOTHING;

  IF v_employee.company_id IS NOT NULL THEN
    INSERT INTO public.user_company_access (user_id, company_id, role)
    VALUES (NEW.id, v_employee.company_id, 'employee')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$fn$;
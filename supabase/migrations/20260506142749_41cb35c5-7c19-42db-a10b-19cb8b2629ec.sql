
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(coalesce(NEW.email, ''));
  v_employee record;
BEGIN
  -- Allow if this is the very first user (bootstrap super admin) — no employees exist yet
  IF NOT EXISTS (SELECT 1 FROM public.employees) THEN
    INSERT INTO public.profiles (user_id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
    RETURN NEW;
  END IF;

  -- Find a matching active employee by email (case-insensitive)
  SELECT * INTO v_employee
  FROM public.employees
  WHERE lower(email) = v_email
    AND status = 'active'
  LIMIT 1;

  IF v_employee.id IS NULL THEN
    RAISE EXCEPTION 'אימייל זה אינו רשום כעובד פעיל בארגון. פנה למנהל המערכת.'
      USING ERRCODE = '42501';
  END IF;

  -- Create profile
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', v_employee.full_name, NEW.email));

  -- Default role
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');

  -- Link the employee record to this auth user (only if not already linked)
  IF v_employee.linked_user_id IS NULL THEN
    UPDATE public.employees SET linked_user_id = NEW.id WHERE id = v_employee.id;
  END IF;

  -- Grant company access
  IF v_employee.company_id IS NOT NULL THEN
    INSERT INTO public.user_company_access (user_id, company_id, role)
    VALUES (NEW.id, v_employee.company_id, 'employee')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

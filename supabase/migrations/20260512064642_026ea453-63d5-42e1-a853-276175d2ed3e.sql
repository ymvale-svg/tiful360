CREATE OR REPLACE FUNCTION public.set_employee_remote_punch(_employee_id uuid, _value boolean)
RETURNS public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_emp public.employees;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_emp FROM public.employees WHERE id = _employee_id;
  IF v_emp.id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR (
      (public.has_role(v_uid, 'admin'::app_role)
        OR public.is_payroll(v_uid)
        OR public.is_operations(v_uid)
        OR public.has_role(v_uid, 'finance'::app_role))
      AND v_emp.company_id IN (SELECT public.user_company_ids(v_uid))
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.employees
  SET can_remote_punch = COALESCE(_value, false),
      updated_at = now()
  WHERE id = _employee_id
  RETURNING * INTO v_emp;

  RETURN v_emp;
END;
$$;
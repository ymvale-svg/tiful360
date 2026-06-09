CREATE OR REPLACE FUNCTION public.set_company_attendance_auto_approve(_company_id uuid, _value boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR (
      (public.has_role(v_uid, 'admin'::app_role)
        OR public.is_payroll(v_uid)
        OR public.is_operations(v_uid)
        OR public.has_role(v_uid, 'finance'::app_role))
      AND _company_id IN (SELECT public.user_company_ids(v_uid))
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.companies
  SET attendance_corrections_auto_approve = COALESCE(_value, false)
  WHERE id = _company_id;

  RETURN COALESCE(_value, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_company_attendance_auto_approve(uuid, boolean) TO authenticated;
-- HR users get every permission payroll users have.
--
-- All payroll access in RLS policies and SECURITY DEFINER functions goes
-- through public.is_payroll (attendance punches, attendance corrections,
-- admin_edit_punch_time, set_employee_remote_punch, live locations,
-- unmatched-punch alerts, tax forms, dependents, leave attachments, ...).
-- Extending the helper to the 'hr' role grants HR the same capabilities in
-- one place, so new payroll policies automatically apply to HR as well.
CREATE OR REPLACE FUNCTION public.is_payroll(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('payroll'::app_role, 'hr'::app_role, 'super_admin'::app_role)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_payroll(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_payroll(uuid) TO authenticated, service_role;

-- Fix: employees could not submit attendance correction requests when the
-- company has attendance_corrections_auto_approve enabled.
--
-- The BEFORE INSERT trigger attendance_correction_before_insert_fn switches
-- status from 'pending' to 'approved' for auto-approve companies. RLS WITH CHECK
-- is evaluated on the row *after* BEFORE triggers, so the employee policy
-- (status = 'pending') rejected it with
-- "new row violates row-level security policy for table attendance_corrections".
--
-- The policy now also accepts the trigger's auto-approved state, but only when
-- the company really has auto-approve on. Checks run in a SECURITY DEFINER
-- helper so they do not depend on the caller's RLS on employees/companies.

CREATE OR REPLACE FUNCTION public.can_employee_insert_attendance_correction(
  _employee_id uuid,
  _company_id uuid,
  _status text,
  _user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.companies c ON c.id = e.company_id
    WHERE e.id = _employee_id
      AND e.linked_user_id = _user_id
      AND e.company_id = _company_id
      AND (
        _status = 'pending'
        OR (_status = 'approved' AND COALESCE(c.attendance_corrections_auto_approve, false))
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_employee_insert_attendance_correction(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_employee_insert_attendance_correction(uuid, uuid, text, uuid) TO authenticated;

DROP POLICY IF EXISTS "Employees create own corrections" ON public.attendance_corrections;

CREATE POLICY "Employees create own corrections"
ON public.attendance_corrections FOR INSERT TO authenticated
WITH CHECK (
  initiated_by = 'employee'
  AND reviewed_by IS NULL
  AND applied_at IS NULL
  AND public.can_employee_insert_attendance_correction(employee_id, company_id, status, auth.uid())
);

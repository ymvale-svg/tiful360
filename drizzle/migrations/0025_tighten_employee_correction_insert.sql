DROP POLICY IF EXISTS "Employees create own corrections" ON public.attendance_corrections;
CREATE POLICY "Employees create own corrections" ON public.attendance_corrections
FOR INSERT TO authenticated
WITH CHECK (is_my_employee_record(employee_id, auth.uid()) AND (
  status = 'pending'
  OR (status = 'approved' AND EXISTS (SELECT 1 FROM public.companies c
       WHERE c.id = company_id AND c.attendance_corrections_auto_approve = true))
));
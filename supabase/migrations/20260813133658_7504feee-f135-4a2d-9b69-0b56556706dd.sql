DROP POLICY IF EXISTS "Employees can create their own leave requests" ON public.leave_requests;
CREATE POLICY "Employees can create their own leave requests"
ON public.leave_requests FOR INSERT TO authenticated
WITH CHECK (is_my_employee_record(employee_id, auth.uid()));
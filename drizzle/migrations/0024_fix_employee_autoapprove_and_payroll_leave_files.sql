DROP POLICY IF EXISTS "Employees create own corrections" ON public.attendance_corrections;
CREATE POLICY "Employees create own corrections" ON public.attendance_corrections
FOR INSERT TO authenticated
WITH CHECK (is_my_employee_record(employee_id, auth.uid()) AND status IN ('pending','approved'));

CREATE POLICY "Payroll and HR view company leave attachments" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'leave-attachments'
  AND (public.is_payroll(auth.uid()) OR public.is_hr(auth.uid()))
  AND EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = ((storage.foldername(objects.name))[1])::uuid
      AND e.company_id IN (SELECT public.user_company_ids(auth.uid()))));
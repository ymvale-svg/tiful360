ALTER TYPE public.leave_request_type ADD VALUE IF NOT EXISTS 'training';
ALTER TYPE public.leave_request_type ADD VALUE IF NOT EXISTS 'unpaid';

CREATE POLICY "Payroll manages company corrections" ON public.attendance_corrections
FOR ALL TO authenticated
USING (public.is_payroll(auth.uid()) AND (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid()))))
WITH CHECK (public.is_payroll(auth.uid()) AND (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid()))));

CREATE POLICY "Payroll records company absences" ON public.leave_requests
FOR INSERT TO authenticated
WITH CHECK (public.is_payroll(auth.uid()) AND (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid()))));
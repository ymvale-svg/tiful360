CREATE POLICY "HR manages company leave requests" ON public.leave_requests FOR ALL TO authenticated
USING (is_hr(auth.uid()) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))))
WITH CHECK (is_hr(auth.uid()) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))));

CREATE POLICY "HR manages company corrections" ON public.attendance_corrections FOR ALL TO authenticated
USING (is_hr(auth.uid()) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))))
WITH CHECK (is_hr(auth.uid()) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))));

CREATE POLICY "HR views company punches" ON public.attendance_punches FOR SELECT TO authenticated
USING (is_hr(auth.uid()) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))));

CREATE POLICY "HR views company attendance" ON public.attendance_records FOR SELECT TO authenticated
USING (is_hr(auth.uid()) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))));

CREATE POLICY "HR views company employee vehicles" ON public.employee_vehicles FOR SELECT TO authenticated
USING (is_hr(auth.uid()) AND company_id IN (SELECT user_company_ids(auth.uid())));
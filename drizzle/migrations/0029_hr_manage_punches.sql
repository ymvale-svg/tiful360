CREATE POLICY "HR manages company punches" ON public.attendance_punches FOR ALL TO authenticated
USING (is_hr(auth.uid()) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))))
WITH CHECK (is_hr(auth.uid()) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))));
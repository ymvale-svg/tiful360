
DROP POLICY IF EXISTS "Staff view company employees" ON public.employees;
DROP POLICY IF EXISTS "Admins and Operations insert company employees" ON public.employees;
DROP POLICY IF EXISTS "Admins and Operations update company employees" ON public.employees;
DROP POLICY IF EXISTS "Admins and Operations delete company employees" ON public.employees;

CREATE POLICY "Staff view company employees"
ON public.employees FOR SELECT TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role)
   OR has_role(auth.uid(), 'it_manager'::app_role)
   OR is_operations(auth.uid())
   OR is_payroll(auth.uid())
   OR has_role(auth.uid(), 'hr'::app_role))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Admins HR Payroll Ops insert company employees"
ON public.employees FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role)
   OR is_operations(auth.uid())
   OR is_payroll(auth.uid())
   OR has_role(auth.uid(), 'hr'::app_role))
  AND company_id IS NOT NULL
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Admins HR Payroll Ops update company employees"
ON public.employees FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role)
   OR is_operations(auth.uid())
   OR is_payroll(auth.uid())
   OR has_role(auth.uid(), 'hr'::app_role))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Admins HR Payroll Ops delete company employees"
ON public.employees FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role)
   OR is_operations(auth.uid())
   OR is_payroll(auth.uid())
   OR has_role(auth.uid(), 'hr'::app_role))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

DROP POLICY IF EXISTS "Payroll staff view company payslips" ON public.payslips;
DROP POLICY IF EXISTS "Payroll staff insert company payslips" ON public.payslips;
DROP POLICY IF EXISTS "Payroll staff update company payslips" ON public.payslips;

CREATE POLICY "Payroll staff view company payslips"
ON public.payslips FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR ((has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR has_role(auth.uid(), 'finance'::app_role))
      AND (company_id IN (SELECT user_company_ids(auth.uid()))))
);

CREATE POLICY "Payroll staff insert company payslips"
ON public.payslips FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR has_role(auth.uid(), 'finance'::app_role))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
);

CREATE POLICY "Payroll staff update company payslips"
ON public.payslips FOR UPDATE
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR has_role(auth.uid(), 'finance'::app_role))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
);

DROP POLICY IF EXISTS "Payroll staff view company payslip batches" ON public.payslip_batches;
DROP POLICY IF EXISTS "Payroll staff insert company payslip batches" ON public.payslip_batches;
DROP POLICY IF EXISTS "Payroll staff update company payslip batches" ON public.payslip_batches;

CREATE POLICY "Payroll staff view company payslip batches"
ON public.payslip_batches FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR ((has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR has_role(auth.uid(), 'finance'::app_role))
      AND (company_id IN (SELECT user_company_ids(auth.uid()))))
);

CREATE POLICY "Payroll staff insert company payslip batches"
ON public.payslip_batches FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR has_role(auth.uid(), 'finance'::app_role))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
);

CREATE POLICY "Payroll staff update company payslip batches"
ON public.payslip_batches FOR UPDATE
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR has_role(auth.uid(), 'finance'::app_role))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
);
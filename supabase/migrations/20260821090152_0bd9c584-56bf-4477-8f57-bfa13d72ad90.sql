-- helper
CREATE OR REPLACE FUNCTION public.is_hr(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id)
      OR public.has_role(_user_id, 'hr'::app_role);
$$;

-- ============ payslips ============
DROP POLICY IF EXISTS "Payroll staff view company payslips" ON public.payslips;
DROP POLICY IF EXISTS "Payroll staff insert company payslips" ON public.payslips;
DROP POLICY IF EXISTS "Payroll staff update company payslips" ON public.payslips;
DROP POLICY IF EXISTS "Admins delete company payslips" ON public.payslips;

CREATE POLICY "Payroll staff view company payslips"
ON public.payslips FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR ((has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
      AND company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Payroll staff insert company payslips"
ON public.payslips FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Payroll staff update company payslips"
ON public.payslips FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Admins delete company payslips"
ON public.payslips FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============ payslip_batches ============
DROP POLICY IF EXISTS "Payroll staff view company payslip batches" ON public.payslip_batches;
DROP POLICY IF EXISTS "Payroll staff insert company payslip batches" ON public.payslip_batches;
DROP POLICY IF EXISTS "Payroll staff update company payslip batches" ON public.payslip_batches;
DROP POLICY IF EXISTS "Admins delete company payslip batches" ON public.payslip_batches;

CREATE POLICY "Payroll staff view company payslip batches"
ON public.payslip_batches FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR ((has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
      AND company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Payroll staff insert company payslip batches"
ON public.payslip_batches FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Payroll staff update company payslip batches"
ON public.payslip_batches FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Admins delete company payslip batches"
ON public.payslip_batches FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============ tax_form_101 ============
DROP POLICY IF EXISTS "Payroll/Admin view company tax forms" ON public.tax_form_101;
DROP POLICY IF EXISTS "Payroll/Admin insert company tax forms" ON public.tax_form_101;
DROP POLICY IF EXISTS "Payroll/Admin update company tax forms" ON public.tax_form_101;
DROP POLICY IF EXISTS "Payroll/Admin delete company tax forms" ON public.tax_form_101;

CREATE POLICY "Payroll/Admin view company tax forms"
ON public.tax_form_101 FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR ((has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
      AND company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Payroll/Admin insert company tax forms"
ON public.tax_form_101 FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Payroll/Admin update company tax forms"
ON public.tax_form_101 FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Payroll/Admin delete company tax forms"
ON public.tax_form_101 FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============ employee_dependents ============
DROP POLICY IF EXISTS "Staff view company dependents" ON public.employee_dependents;
DROP POLICY IF EXISTS "Staff manage company dependents" ON public.employee_dependents;

CREATE POLICY "Staff view company dependents"
ON public.employee_dependents FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR ((has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
      AND company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Staff manage company dependents"
ON public.employee_dependents FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============ storage: payslips ============
DROP POLICY IF EXISTS "Staff manage payslips storage" ON storage.objects;
CREATE POLICY "Staff manage payslips storage"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'payslips'
  AND (is_super_admin(auth.uid())
       OR ((has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
           AND ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid()))))
)
WITH CHECK (
  bucket_id = 'payslips'
  AND (is_super_admin(auth.uid())
       OR ((has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
           AND ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid()))))
);

-- ============ storage: tax forms ============
DROP POLICY IF EXISTS "Staff view company tax form files" ON storage.objects;
CREATE POLICY "Staff view company tax form files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tax-forms-101'
  AND (is_super_admin(auth.uid())
       OR EXISTS (
         SELECT 1 FROM public.tax_form_101 t
         WHERE t.pdf_url LIKE '%' || objects.name || '%'
           AND (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
           AND t.company_id IN (SELECT user_company_ids(auth.uid()))
       ))
);

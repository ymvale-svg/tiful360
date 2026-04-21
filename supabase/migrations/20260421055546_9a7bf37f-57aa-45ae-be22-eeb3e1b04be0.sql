
-- 1. Add columns to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS michpal_code text,
  ADD COLUMN IF NOT EXISTS vacation_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sick_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balances_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS balances_source text;

CREATE UNIQUE INDEX IF NOT EXISTS employees_company_michpal_code_uniq
  ON public.employees(company_id, michpal_code)
  WHERE michpal_code IS NOT NULL;

-- 2. payslip_batches table
CREATE TABLE IF NOT EXISTS public.payslip_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_year int NOT NULL,
  period_month int NOT NULL,
  total_pages int NOT NULL DEFAULT 0,
  matched_count int NOT NULL DEFAULT 0,
  unmatched_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  original_filename text,
  status text NOT NULL DEFAULT 'processing',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payslip_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view company payslip batches"
  ON public.payslip_batches FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role)) AND company_id IN (SELECT user_company_ids(auth.uid()))));

CREATE POLICY "Staff insert company payslip batches"
  ON public.payslip_batches FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role)) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))));

CREATE POLICY "Staff update company payslip batches"
  ON public.payslip_batches FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role)) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))));

CREATE POLICY "Admins delete company payslip batches"
  ON public.payslip_batches FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))));

-- 3. payslips table
CREATE TABLE IF NOT EXISTS public.payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  michpal_code_detected text,
  employee_name_detected text,
  period_year int NOT NULL,
  period_month int NOT NULL,
  pdf_url text,
  vacation_balance numeric,
  sick_balance numeric,
  gross_salary numeric,
  net_salary numeric,
  work_days int,
  work_hours numeric,
  extraction_status text NOT NULL DEFAULT 'success',
  extraction_notes text,
  batch_id uuid REFERENCES public.payslip_batches(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payslips_employee_period_uniq
  ON public.payslips(employee_id, period_year, period_month)
  WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payslips_company_period_idx
  ON public.payslips(company_id, period_year, period_month);

CREATE INDEX IF NOT EXISTS payslips_batch_idx ON public.payslips(batch_id);

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view company payslips"
  ON public.payslips FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role)) AND company_id IN (SELECT user_company_ids(auth.uid()))));

CREATE POLICY "Employees view own payslips"
  ON public.payslips FOR SELECT TO authenticated
  USING (employee_id IS NOT NULL AND EXISTS (SELECT 1 FROM employees e WHERE e.id = payslips.employee_id AND e.linked_user_id = auth.uid()));

CREATE POLICY "Staff insert company payslips"
  ON public.payslips FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role)) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))));

CREATE POLICY "Staff update company payslips"
  ON public.payslips FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role)) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))));

CREATE POLICY "Admins delete company payslips"
  ON public.payslips FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))));

-- 4. Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payslips', 'payslips', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: staff full access to their company folder, employees read own
CREATE POLICY "Staff manage payslips storage"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'payslips' AND (
      is_super_admin(auth.uid()) OR
      ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
        AND (storage.foldername(name))[1]::uuid IN (SELECT user_company_ids(auth.uid())))
    )
  )
  WITH CHECK (
    bucket_id = 'payslips' AND (
      is_super_admin(auth.uid()) OR
      ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
        AND (storage.foldername(name))[1]::uuid IN (SELECT user_company_ids(auth.uid())))
    )
  );

CREATE POLICY "Employees read own payslips storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payslips' AND EXISTS (
      SELECT 1 FROM public.payslips p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.pdf_url = storage.objects.name AND e.linked_user_id = auth.uid()
    )
  );

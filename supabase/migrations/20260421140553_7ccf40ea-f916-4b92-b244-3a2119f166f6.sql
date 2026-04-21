
-- New table: tax_form_101
CREATE TABLE public.tax_form_101 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  company_id uuid NOT NULL,
  tax_year integer NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | signed | sent
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_data text,
  pdf_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  signed_at timestamptz,
  sent_at timestamptz,
  sent_to text[] DEFAULT '{}'::text[],
  access_token uuid UNIQUE DEFAULT gen_random_uuid(),
  token_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, tax_year)
);

CREATE INDEX idx_tax_form_101_employee ON public.tax_form_101(employee_id);
CREATE INDEX idx_tax_form_101_company ON public.tax_form_101(company_id);
CREATE INDEX idx_tax_form_101_token ON public.tax_form_101(access_token);

ALTER TABLE public.tax_form_101 ENABLE ROW LEVEL SECURITY;

-- Employee: view own
CREATE POLICY "Employees view own tax forms"
ON public.tax_form_101 FOR SELECT TO authenticated
USING (is_my_employee_record(employee_id, auth.uid()));

-- Employee: update own pending (to sign)
CREATE POLICY "Employees update own pending tax forms"
ON public.tax_form_101 FOR UPDATE TO authenticated
USING (is_my_employee_record(employee_id, auth.uid()) AND status = 'pending');

-- Public access via token (for email link, no login required)
CREATE POLICY "Public read by access token"
ON public.tax_form_101 FOR SELECT TO anon, authenticated
USING (access_token IS NOT NULL);

CREATE POLICY "Public update by access token"
ON public.tax_form_101 FOR UPDATE TO anon, authenticated
USING (access_token IS NOT NULL AND status = 'pending');

-- Payroll/Admin: view company forms
CREATE POLICY "Payroll/Admin view company tax forms"
ON public.tax_form_101 FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid()) OR
  ((has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()))
   AND company_id IN (SELECT user_company_ids(auth.uid())))
);

-- Payroll/Admin: insert company forms
CREATE POLICY "Payroll/Admin insert company tax forms"
ON public.tax_form_101 FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- Payroll/Admin: update company forms
CREATE POLICY "Payroll/Admin update company tax forms"
ON public.tax_form_101 FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- Payroll/Admin: delete company forms
CREATE POLICY "Payroll/Admin delete company tax forms"
ON public.tax_form_101 FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- Updated_at trigger
CREATE TRIGGER trg_tax_form_101_updated_at
BEFORE UPDATE ON public.tax_form_101
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- New table: employee_dependents
CREATE TABLE public.employee_dependents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  company_id uuid,
  full_name text NOT NULL,
  id_number text,
  birth_date date,
  is_in_custody boolean NOT NULL DEFAULT true,
  receives_allowance boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_dependents_employee ON public.employee_dependents(employee_id);

ALTER TABLE public.employee_dependents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees view own dependents"
ON public.employee_dependents FOR SELECT TO authenticated
USING (is_my_employee_record(employee_id, auth.uid()));

CREATE POLICY "Employees manage own dependents"
ON public.employee_dependents FOR ALL TO authenticated
USING (is_my_employee_record(employee_id, auth.uid()))
WITH CHECK (is_my_employee_record(employee_id, auth.uid()));

CREATE POLICY "Staff view company dependents"
ON public.employee_dependents FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid()) OR
  ((has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_operations(auth.uid()))
   AND company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Staff manage company dependents"
ON public.employee_dependents FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE TRIGGER trg_employee_dependents_updated_at
BEFORE UPDATE ON public.employee_dependents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Add columns to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS house_number text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS po_box text,
  ADD COLUMN IF NOT EXISTS country_of_birth text,
  ADD COLUMN IF NOT EXISTS aliyah_date date,
  ADD COLUMN IF NOT EXISTS marital_status text,
  ADD COLUMN IF NOT EXISTS is_israeli_resident boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS health_fund_member boolean DEFAULT true;


-- Storage bucket for signed PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('tax-forms-101', 'tax-forms-101', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Employees view own tax form files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tax-forms-101' AND
  EXISTS (
    SELECT 1 FROM public.tax_form_101 t
    JOIN public.employees e ON e.id = t.employee_id
    WHERE t.pdf_url LIKE '%' || name || '%'
      AND e.linked_user_id = auth.uid()
  )
);

CREATE POLICY "Staff view company tax form files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tax-forms-101' AND (
    is_super_admin(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.tax_form_101 t
      WHERE t.pdf_url LIKE '%' || name || '%'
        AND (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()))
        AND t.company_id IN (SELECT user_company_ids(auth.uid()))
    )
  )
);

CREATE POLICY "Authenticated insert tax form files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'tax-forms-101');

CREATE POLICY "Anon insert tax form files via token flow"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'tax-forms-101');

CREATE POLICY "Anon read tax form files via token flow"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'tax-forms-101');

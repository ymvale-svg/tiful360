
-- 1. Create sub_employers table
CREATE TABLE public.sub_employers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  tax_id text NOT NULL,
  address text,
  city text,
  postal_code text,
  phone text,
  email text,
  withholding_file_number text,
  contact_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sub_employers_company_id ON public.sub_employers(company_id);

ALTER TABLE public.sub_employers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users view company sub_employers"
ON public.sub_employers FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR company_id IN (SELECT user_company_ids(auth.uid()))
);

CREATE POLICY "Admins manage company sub_employers"
ON public.sub_employers FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- updated_at trigger
CREATE TRIGGER update_sub_employers_updated_at
BEFORE UPDATE ON public.sub_employers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add sub_employer_id to employees
ALTER TABLE public.employees
ADD COLUMN sub_employer_id uuid REFERENCES public.sub_employers(id) ON DELETE SET NULL;

CREATE INDEX idx_employees_sub_employer_id ON public.employees(sub_employer_id);

-- 3. Add sub_employer_id to tax_form_101
ALTER TABLE public.tax_form_101
ADD COLUMN sub_employer_id uuid REFERENCES public.sub_employers(id) ON DELETE SET NULL;

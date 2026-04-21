
CREATE TABLE public.offboarding_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  it_ticket_id uuid,
  end_date date,
  form_index integer NOT NULL DEFAULT 1,
  form_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  sign_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'pending',
  signature_data text,
  attached_document_url text,
  pdf_url text,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE UNIQUE INDEX offboarding_forms_sign_token_idx ON public.offboarding_forms(sign_token);
CREATE INDEX offboarding_forms_employee_idx ON public.offboarding_forms(employee_id);
CREATE INDEX offboarding_forms_company_idx ON public.offboarding_forms(company_id);

ALTER TABLE public.offboarding_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view company offboarding forms"
ON public.offboarding_forms FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid()) OR
  ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
   AND company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Staff insert company offboarding forms"
ON public.offboarding_forms FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Staff update company offboarding forms"
ON public.offboarding_forms FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Staff delete company offboarding forms"
ON public.offboarding_forms FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Employees view own offboarding forms"
ON public.offboarding_forms FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM employees e
          WHERE e.id = offboarding_forms.employee_id AND e.linked_user_id = auth.uid())
);

CREATE POLICY "Employees update own pending offboarding forms"
ON public.offboarding_forms FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM employees e
          WHERE e.id = offboarding_forms.employee_id AND e.linked_user_id = auth.uid())
);

CREATE POLICY "Public read offboarding by sign token"
ON public.offboarding_forms FOR SELECT TO anon, authenticated
USING (sign_token IS NOT NULL);

CREATE POLICY "Public update offboarding by sign token"
ON public.offboarding_forms FOR UPDATE TO anon, authenticated
USING (sign_token IS NOT NULL AND status = 'pending');

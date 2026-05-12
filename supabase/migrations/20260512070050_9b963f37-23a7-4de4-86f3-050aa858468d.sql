CREATE TABLE IF NOT EXISTS public.company_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  template_key text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, template_key)
);

ALTER TABLE public.company_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view company email templates"
ON public.company_email_templates FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    (has_role(auth.uid(), 'admin'::app_role)
      OR is_payroll(auth.uid())
      OR has_role(auth.uid(), 'finance'::app_role))
    AND company_id IN (SELECT user_company_ids(auth.uid()))
  )
);

CREATE POLICY "Staff manage company email templates"
ON public.company_email_templates FOR ALL TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    (has_role(auth.uid(), 'admin'::app_role)
      OR is_payroll(auth.uid())
      OR has_role(auth.uid(), 'finance'::app_role))
    AND company_id IN (SELECT user_company_ids(auth.uid()))
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    (has_role(auth.uid(), 'admin'::app_role)
      OR is_payroll(auth.uid())
      OR has_role(auth.uid(), 'finance'::app_role))
    AND company_id IN (SELECT user_company_ids(auth.uid()))
  )
);

CREATE TRIGGER trg_company_email_templates_updated_at
BEFORE UPDATE ON public.company_email_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
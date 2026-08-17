ALTER TYPE ticket_type ADD VALUE IF NOT EXISTS 'onboarding';

ALTER TABLE public.asset_categories
  ADD COLUMN IF NOT EXISTS onboarding_form_group text;

CREATE TABLE public.onboarding_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  pdf_url text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_processes TO authenticated;
GRANT ALL ON public.onboarding_processes TO service_role;
ALTER TABLE public.onboarding_processes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage company onboarding processes"
ON public.onboarding_processes FOR ALL TO authenticated
USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role)
   OR is_operations(auth.uid()) OR has_role(auth.uid(),'hr'::app_role))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
)
WITH CHECK (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role)
   OR is_operations(auth.uid()) OR has_role(auth.uid(),'hr'::app_role))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Employees view own onboarding"
ON public.onboarding_processes FOR SELECT TO authenticated
USING (employee_id IN (SELECT id FROM public.employees WHERE linked_user_id = auth.uid()));

CREATE TABLE public.onboarding_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid NOT NULL REFERENCES public.onboarding_processes(id) ON DELETE CASCADE,
  item_type text NOT NULL DEFAULT 'asset',
  title text NOT NULL,
  owner_role text NOT NULL DEFAULT 'it_manager',
  catalog_ref_id uuid REFERENCES public.asset_categories(id) ON DELETE SET NULL,
  selected_group_id uuid REFERENCES public.asset_groups(id) ON DELETE SET NULL,
  fulfillment_type text,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_onboarding_items_process ON public.onboarding_items(process_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_items TO authenticated;
GRANT ALL ON public.onboarding_items TO service_role;
ALTER TABLE public.onboarding_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage company onboarding items"
ON public.onboarding_items FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.onboarding_processes p
  WHERE p.id = onboarding_items.process_id
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role)
         OR is_operations(auth.uid()) OR has_role(auth.uid(),'hr'::app_role))
    AND (is_super_admin(auth.uid()) OR p.company_id IN (SELECT user_company_ids(auth.uid())))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.onboarding_processes p
  WHERE p.id = onboarding_items.process_id
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role)
         OR is_operations(auth.uid()) OR has_role(auth.uid(),'hr'::app_role))
    AND (is_super_admin(auth.uid()) OR p.company_id IN (SELECT user_company_ids(auth.uid())))
));

CREATE POLICY "Employees view own onboarding items"
ON public.onboarding_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.onboarding_processes p
  JOIN public.employees e ON e.id = p.employee_id
  WHERE p.id = onboarding_items.process_id AND e.linked_user_id = auth.uid()
));

CREATE TABLE public.role_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role_name text NOT NULL,
  department text,
  default_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_templates TO authenticated;
GRANT ALL ON public.role_templates TO service_role;
ALTER TABLE public.role_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage company role templates"
ON public.role_templates FOR ALL TO authenticated
USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role)
   OR is_operations(auth.uid()) OR has_role(auth.uid(),'hr'::app_role))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
)
WITH CHECK (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role)
   OR is_operations(auth.uid()) OR has_role(auth.uid(),'hr'::app_role))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE TRIGGER onboarding_processes_updated_at
BEFORE UPDATE ON public.onboarding_processes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER role_templates_updated_at
BEFORE UPDATE ON public.role_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
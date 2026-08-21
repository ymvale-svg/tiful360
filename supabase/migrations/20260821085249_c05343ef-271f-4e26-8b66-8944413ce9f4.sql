CREATE TABLE public.asset_group_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.asset_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  manufacturer text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_group_models TO authenticated;
GRANT ALL ON public.asset_group_models TO service_role;

ALTER TABLE public.asset_group_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view company asset group models"
ON public.asset_group_models FOR SELECT TO authenticated
USING (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))));

CREATE POLICY "Staff manage company asset group models"
ON public.asset_group_models FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()) OR has_role(auth.uid(), 'hr'::app_role))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()) OR has_role(auth.uid(), 'hr'::app_role))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
);

CREATE INDEX idx_asset_group_models_group ON public.asset_group_models(group_id);

CREATE TRIGGER update_asset_group_models_updated_at
BEFORE UPDATE ON public.asset_group_models
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.onboarding_items
  ADD COLUMN selected_model_id uuid REFERENCES public.asset_group_models(id) ON DELETE SET NULL;
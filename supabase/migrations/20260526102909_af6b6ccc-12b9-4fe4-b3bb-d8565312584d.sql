-- Create asset_groups table
CREATE TABLE public.asset_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES public.asset_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (category_id, name)
);

CREATE INDEX idx_asset_groups_category ON public.asset_groups(category_id);
CREATE INDEX idx_asset_groups_company ON public.asset_groups(company_id);

ALTER TABLE public.asset_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view company asset groups"
  ON public.asset_groups FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))));

CREATE POLICY "Admins and Operations manage company asset groups"
  ON public.asset_groups FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()))
    AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid())))))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()))
    AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid())))));

CREATE TRIGGER update_asset_groups_updated_at
  BEFORE UPDATE ON public.asset_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add group_id to assets
ALTER TABLE public.assets ADD COLUMN group_id uuid REFERENCES public.asset_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_assets_group ON public.assets(group_id);
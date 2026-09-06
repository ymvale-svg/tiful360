CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  contact_name text,
  phone text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites TO authenticated;
GRANT ALL ON public.sites TO service_role;

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view sites"
ON public.sites FOR SELECT TO authenticated
USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Managers can insert sites"
ON public.sites FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_company_admin(auth.uid(), company_id)
    OR public.is_operations(auth.uid())
    OR public.has_role(auth.uid(), 'it_manager')
  )
);

CREATE POLICY "Managers can update sites"
ON public.sites FOR UPDATE TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_company_admin(auth.uid(), company_id)
    OR public.is_operations(auth.uid())
    OR public.has_role(auth.uid(), 'it_manager')
  )
)
WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Managers can delete sites"
ON public.sites FOR DELETE TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_company_admin(auth.uid(), company_id)
    OR public.is_operations(auth.uid())
    OR public.has_role(auth.uid(), 'it_manager')
  )
);

CREATE TRIGGER update_sites_updated_at
BEFORE UPDATE ON public.sites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX sites_company_name_uniq ON public.sites (company_id, lower(name));

ALTER TABLE public.assets ADD COLUMN assigned_site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
CREATE INDEX assets_assigned_site_id_idx ON public.assets (assigned_site_id);
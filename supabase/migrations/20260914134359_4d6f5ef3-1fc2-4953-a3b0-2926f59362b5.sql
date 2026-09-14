CREATE TABLE public.site_containers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_containers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_containers TO authenticated;
GRANT ALL ON public.site_containers TO service_role;
ALTER TABLE public.site_containers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company members can view containers" ON public.site_containers
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));
CREATE POLICY "Admins, ops and IT can insert containers" ON public.site_containers
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND (
      public.is_company_admin(auth.uid(), company_id)
      OR public.is_super_admin(auth.uid())
      OR public.is_operations(auth.uid())
      OR public.has_role(auth.uid(), 'it_manager')
    )
  );
CREATE POLICY "Admins, ops and IT can update containers" ON public.site_containers
  FOR UPDATE TO authenticated
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND (
      public.is_company_admin(auth.uid(), company_id)
      OR public.is_super_admin(auth.uid())
      OR public.is_operations(auth.uid())
      OR public.has_role(auth.uid(), 'it_manager')
    )
  );
CREATE POLICY "Admins, ops and IT can delete containers" ON public.site_containers
  FOR DELETE TO authenticated
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND (
      public.is_company_admin(auth.uid(), company_id)
      OR public.is_super_admin(auth.uid())
      OR public.is_operations(auth.uid())
      OR public.has_role(auth.uid(), 'it_manager')
    )
  );
CREATE TRIGGER update_site_containers_updated_at BEFORE UPDATE ON public.site_containers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.assets ADD COLUMN container_id uuid REFERENCES public.site_containers(id) ON DELETE SET NULL;
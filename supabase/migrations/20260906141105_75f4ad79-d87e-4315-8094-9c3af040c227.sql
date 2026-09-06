ALTER TABLE public.it_tickets
  ADD COLUMN IF NOT EXISTS subject_category text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS related_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.sla_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_category text NOT NULL,
  priority text NOT NULL,
  target_hours integer NOT NULL DEFAULT 24,
  notify_on_breach boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, subject_category, priority)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_settings TO authenticated;
GRANT ALL ON public.sla_settings TO service_role;

ALTER TABLE public.sla_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sla_settings_select_company" ON public.sla_settings
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "sla_settings_manage" ON public.sla_settings
  FOR ALL TO authenticated
  USING (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND (public.is_super_admin(auth.uid()) OR public.is_operations(auth.uid()) OR public.is_company_admin(auth.uid(), company_id))
  )
  WITH CHECK (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND (public.is_super_admin(auth.uid()) OR public.is_operations(auth.uid()) OR public.is_company_admin(auth.uid(), company_id))
  );

CREATE TRIGGER update_sla_settings_updated_at
  BEFORE UPDATE ON public.sla_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
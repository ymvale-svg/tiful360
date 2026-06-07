ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS portal_name text,
  ADD COLUMN IF NOT EXISTS portal_logo_url text,
  ADD COLUMN IF NOT EXISTS portal_primary_color text;

GRANT SELECT (portal_name, portal_logo_url, portal_primary_color) ON public.companies TO authenticated;
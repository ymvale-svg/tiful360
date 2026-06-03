
-- 1. Add G.I.T. integration columns to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS git_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS git_custname text,
  ADD COLUMN IF NOT EXISTS git_username text,
  ADD COLUMN IF NOT EXISTS git_password_encrypted text,
  ADD COLUMN IF NOT EXISTS git_base_url text DEFAULT 'https://a.gold.org.il/api/v1',
  ADD COLUMN IF NOT EXISTS git_default_site_code text;

-- 2. Add G.I.T. mapping columns to it_tickets
ALTER TABLE public.it_tickets
  ADD COLUMN IF NOT EXISTS git_sservname text,
  ADD COLUMN IF NOT EXISTS git_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS git_sync_status text NOT NULL DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS git_sync_error text,
  ADD COLUMN IF NOT EXISTS git_site_code text,
  ADD COLUMN IF NOT EXISTS git_sernum text,
  ADD COLUMN IF NOT EXISTS external_source text NOT NULL DEFAULT 'local';

CREATE UNIQUE INDEX IF NOT EXISTS it_tickets_git_sservname_company_uniq
  ON public.it_tickets(company_id, git_sservname)
  WHERE git_sservname IS NOT NULL;

-- 3. Lookups cache table
CREATE TABLE IF NOT EXISTS public.git_lookups_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lookup_type text NOT NULL,
  lookup_key text NOT NULL DEFAULT '__all__',
  data jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, lookup_type, lookup_key)
);

GRANT SELECT ON public.git_lookups_cache TO authenticated;
GRANT ALL ON public.git_lookups_cache TO service_role;

ALTER TABLE public.git_lookups_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view company lookups cache"
  ON public.git_lookups_cache
  FOR SELECT
  TO authenticated
  USING (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))));

CREATE POLICY "Service role manages lookups cache"
  ON public.git_lookups_cache
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. Helper functions for password encryption (uses pgcrypto)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.git_encrypt_password(_plain text, _key text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.pgp_sym_encrypt(_plain, _key), 'base64');
$$;

CREATE OR REPLACE FUNCTION public.git_decrypt_password(_cipher text, _key text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.pgp_sym_decrypt(decode(_cipher, 'base64'), _key);
$$;

REVOKE ALL ON FUNCTION public.git_encrypt_password(text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.git_decrypt_password(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.git_encrypt_password(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.git_decrypt_password(text, text) TO service_role;

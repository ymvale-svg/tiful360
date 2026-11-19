-- One API key may now be granted several companies, carry explicit permissions
-- (read / write / delete / payroll), expire, and inherit its owner's access.
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS owner_user_id uuid;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT ARRAY['read']::text[];
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.api_keys.owner_user_id IS 'משתמש שהרשאותיו מגדירות מה המפתח יכול לראות ולשנות; ריק = המפתח לא עובד בממשק הפתוח';
COMMENT ON COLUMN public.api_keys.scopes IS 'היקף הפעולות: read, write, delete, payroll';
COMMENT ON COLUMN public.api_keys.expires_at IS 'תאריך תפוגה; ריק = בלי תפוגה';

ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_scopes_allowed;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_scopes_allowed
  CHECK (scopes <@ ARRAY['read','write','delete','payroll']::text[] AND array_length(scopes, 1) > 0);

CREATE INDEX IF NOT EXISTS api_keys_owner_idx ON public.api_keys (owner_user_id);

-- Key -> companies. company_id on api_keys stays as the key's home company for the
-- existing service-ticket API, so nothing there changes.
CREATE TABLE IF NOT EXISTS public.api_key_companies (
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (api_key_id, company_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_key_companies TO authenticated;
GRANT ALL ON public.api_key_companies TO service_role;
ALTER TABLE public.api_key_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super admins manage api key companies" ON public.api_key_companies;
CREATE POLICY "super admins manage api key companies" ON public.api_key_companies
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Backfill: every existing key keeps its home company as a granted company.
INSERT INTO public.api_key_companies (api_key_id, company_id)
SELECT id, company_id FROM public.api_keys
ON CONFLICT (api_key_id, company_id) DO NOTHING;

-- Append-only record of every external call. No foreign keys on purpose: the
-- record must outlive the key and the company it touched.
CREATE TABLE IF NOT EXISTS public.api_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid,
  key_prefix text,
  owner_user_id uuid,
  company_id uuid,
  resource text NOT NULL,
  action text NOT NULL,
  record_id text,
  requested_ids jsonb,
  status text NOT NULL,
  error text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.api_request_log IS 'יומן בלתי ניתן לשינוי של קריאות שהגיעו מהממשק החיצוני';

GRANT SELECT ON public.api_request_log TO authenticated;
GRANT ALL ON public.api_request_log TO service_role;
ALTER TABLE public.api_request_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super admins read api request log" ON public.api_request_log;
CREATE POLICY "super admins read api request log" ON public.api_request_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.api_request_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'api_request_log is append-only: rows cannot be changed or removed';
END $$;

DROP TRIGGER IF EXISTS api_request_log_no_mutation ON public.api_request_log;
CREATE TRIGGER api_request_log_no_mutation
  BEFORE UPDATE OR DELETE ON public.api_request_log
  FOR EACH ROW EXECUTE FUNCTION public.api_request_log_immutable();

CREATE INDEX IF NOT EXISTS api_request_log_created_idx ON public.api_request_log (created_at DESC);
CREATE INDEX IF NOT EXISTS api_request_log_key_idx ON public.api_request_log (api_key_id, created_at DESC);
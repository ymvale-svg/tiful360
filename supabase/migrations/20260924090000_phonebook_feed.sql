-- Corporate directory served to the desk phones.
--
-- Yealink phones fetch a remote phonebook over HTTP by themselves, so the feed
-- has to be reachable without a session: the phone has no browser, no cookies
-- and no way to hold a JWT. A per-company random token in the URL is what
-- stands in for authentication, which is why it lives in its own table and can
-- be rotated without touching anything else.

-- The extension a person answers on. Nullable: not everyone has one, and a
-- shared handset (meeting room, warehouse) has no employee at all.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS extension TEXT;

COMMENT ON COLUMN public.employees.extension IS
  'שלוחה פנימית. משמשת את ספר הטלפונים המרוחק ואת שיוך המכשירים.';

-- Two people on one extension is almost always a data-entry slip, and the
-- directory would then show the same number twice under different names.
CREATE UNIQUE INDEX IF NOT EXISTS employees_company_extension_key
  ON public.employees (company_id, extension)
  WHERE extension IS NOT NULL AND extension <> '';

CREATE TABLE IF NOT EXISTS public.phonebook_feeds (
  company_id      UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  token           UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  -- Whether the phones are actually pulling. Without this there is no way to
  -- tell a working feed from one nobody ever configured on the handsets.
  last_fetched_at TIMESTAMPTZ,
  fetch_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.phonebook_feeds IS
  'טוקן הגישה לספר הטלפונים המרוחק, אחד לכל חברה. מי שמחזיק בו רואה את כל הספרייה — לכן הוא ניתן להחלפה.';

ALTER TABLE public.phonebook_feeds ENABLE ROW LEVEL SECURITY;

-- The token is the credential, so it is readable only by the people who
-- administer the company. The Edge Function reads it with the service role and
-- bypasses this entirely.
DROP POLICY IF EXISTS "Admins read company phonebook feed" ON public.phonebook_feeds;
CREATE POLICY "Admins read company phonebook feed"
ON public.phonebook_feeds FOR SELECT TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
);

DROP POLICY IF EXISTS "Admins manage company phonebook feed" ON public.phonebook_feeds;
CREATE POLICY "Admins manage company phonebook feed"
ON public.phonebook_feeds FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
);

-- Rotating the token invalidates every handset at once, so it is a deliberate
-- action rather than something that happens on any write to the row.
CREATE OR REPLACE FUNCTION public.rotate_phonebook_token(_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new UUID;
BEGIN
  IF NOT (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
    AND (is_super_admin(auth.uid()) OR (_company_id IN (SELECT user_company_ids(auth.uid()))))
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.phonebook_feeds (company_id)
  VALUES (_company_id)
  ON CONFLICT (company_id) DO UPDATE
    SET token = gen_random_uuid(),
        last_fetched_at = NULL,
        fetch_count = 0,
        updated_at = now()
  RETURNING token INTO _new;

  RETURN _new;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_phonebook_token(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_phonebook_token(UUID) TO authenticated;

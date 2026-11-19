-- Security: legacy handover short codes expire 14 days after the form was created.
--
-- Before: forms created before 20261107000000_handover_short_code_hardening.sql
-- still carry 6-character short codes generated with random(). They resolve
-- (anon, via /h/<code>) for as long as the form stays pending, with no expiry and
-- no attempt limit, so guessing one returns the sign_token (read the form incl.
-- ID number, sign as the employee).
--
-- After: a short code shorter than 10 characters (legacy) resolves only within
-- 14 days of the form's created_at. New 10-character codes are unaffected.
-- An employee holding an old expired short link needs a new link (resend from
-- the normal screen); the full-token link keeps working.
--
-- Same definition as 20261107000000, plus the length/created_at condition.

CREATE OR REPLACE FUNCTION public.resolve_handover_short_code(_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sign_token
  FROM public.asset_handover_forms
  WHERE short_code = _code
    AND _code IS NOT NULL
    AND status = 'pending'
    AND (length(short_code) >= 10 OR created_at > now() - interval '14 days')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_handover_short_code(text) TO anon, authenticated;

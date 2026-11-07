-- Security: harden short signing links for asset handover forms (/h/:code).
--
-- Before: resolve_handover_short_code() is callable by anon and returns the full
-- sign_token for ANY form matching a 6-character code generated with random().
-- About 8.9e8 possible codes, with no status check, so guessing codes exposed
-- signed forms (employee ID number, signature) and allowed signing pending forms.
--
-- After:
--   1. The short code resolves only while the form is still pending signature.
--      Signed / cancelled forms no longer resolve (the full-token link still works).
--   2. New short codes are 10 characters from a cryptographic random source
--      (about 8e14 possible codes). Existing codes keep working, so links that
--      were already sent are not broken.

CREATE OR REPLACE FUNCTION public.gen_handover_short_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789';
  bytes bytea;
  code text;
  i int;
BEGIN
  LOOP
    bytes := extensions.gen_random_bytes(10);
    code := '';
    FOR i IN 0..9 LOOP
      code := code || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.asset_handover_forms WHERE short_code = code);
  END LOOP;
  RETURN code;
END;
$$;

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
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_handover_short_code(text) TO anon, authenticated;

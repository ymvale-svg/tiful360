ALTER TABLE public.asset_handover_forms ADD COLUMN IF NOT EXISTS short_code text;

CREATE OR REPLACE FUNCTION public.gen_handover_short_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789';
  code text;
  i int;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.asset_handover_forms WHERE short_code = code);
  END LOOP;
  RETURN code;
END;
$$;

UPDATE public.asset_handover_forms SET short_code = public.gen_handover_short_code() WHERE short_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS asset_handover_forms_short_code_key ON public.asset_handover_forms (short_code);

CREATE OR REPLACE FUNCTION public.set_handover_short_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.short_code IS NULL THEN
    NEW.short_code := public.gen_handover_short_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handover_short_code ON public.asset_handover_forms;
CREATE TRIGGER trg_handover_short_code
BEFORE INSERT ON public.asset_handover_forms
FOR EACH ROW EXECUTE FUNCTION public.set_handover_short_code();

CREATE OR REPLACE FUNCTION public.resolve_handover_short_code(_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sign_token FROM public.asset_handover_forms WHERE short_code = _code LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_handover_short_code(text) TO anon, authenticated;
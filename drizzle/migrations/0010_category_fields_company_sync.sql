CREATE OR REPLACE FUNCTION public.category_fields_set_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL OR TG_OP = 'INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
    SELECT c.company_id INTO NEW.company_id FROM public.asset_categories c WHERE c.id = NEW.category_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_category_fields_set_company ON public.category_fields;
CREATE TRIGGER trg_category_fields_set_company
BEFORE INSERT OR UPDATE ON public.category_fields
FOR EACH ROW EXECUTE FUNCTION public.category_fields_set_company();

UPDATE public.category_fields cf
SET company_id = c.company_id
FROM public.asset_categories c
WHERE c.id = cf.category_id AND cf.company_id IS NULL;
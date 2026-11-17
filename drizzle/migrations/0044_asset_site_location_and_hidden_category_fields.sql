-- An item can be held by an employee and placed on a site at the same time.
-- site_location is the free-text spot inside the assigned site (e.g. "מטבח קומה 2"),
-- so many identical items on one site (e.g. 10 refrigerators) can each be found.
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS site_location text;

-- The location only means something together with a site.
CREATE OR REPLACE FUNCTION public.clear_asset_site_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_site_id IS NULL THEN
    NEW.site_location := NULL;
  ELSIF NEW.site_location IS NOT NULL THEN
    NEW.site_location := NULLIF(btrim(NEW.site_location), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assets_clear_site_location ON public.assets;
CREATE TRIGGER assets_clear_site_location
BEFORE INSERT OR UPDATE OF assigned_site_id, site_location ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.clear_asset_site_location();

CREATE INDEX IF NOT EXISTS assets_site_location_idx
  ON public.assets (assigned_site_id, site_location)
  WHERE site_location IS NOT NULL;

-- Items placed on a site through the older "שיוך לאתר…" custom field had no real site link,
-- so site views and searches missed them. Link them when the value names exactly one site
-- of the same company; the custom field itself is left untouched.
WITH legacy AS (
  SELECT a.id, a.company_id, btrim(kv.value #>> '{}') AS site_name
  FROM public.assets a
  CROSS JOIN LATERAL jsonb_each(COALESCE(a.custom_fields, '{}'::jsonb)) kv
  WHERE a.assigned_site_id IS NULL
    AND btrim(kv.key) LIKE 'שיוך לאתר%'
    AND jsonb_typeof(kv.value) = 'string'
    AND btrim(kv.value #>> '{}') <> ''
), matched AS (
  SELECT l.id, min(s.id::text)::uuid AS site_id
  FROM legacy l
  JOIN public.sites s
    ON s.company_id = l.company_id
   AND lower(btrim(s.name)) = lower(l.site_name)
  GROUP BY l.id
  HAVING count(DISTINCT s.id) = 1
)
UPDATE public.assets a
SET assigned_site_id = m.site_id
FROM matched m
WHERE a.id = m.id;

-- A sub-category can hide fields defined for its whole category (category_fields with
-- group_id NULL), e.g. a microwave does not need its category's computer fields.
-- Stored by field id so renaming a field keeps the choice; saved values stay in custom_fields.
ALTER TABLE public.asset_groups
  ADD COLUMN IF NOT EXISTS hidden_category_fields uuid[] NOT NULL DEFAULT '{}';

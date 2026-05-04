ALTER TABLE public.asset_categories ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Initialize sort_order based on creation date for existing rows
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at) - 1 AS rn
  FROM public.asset_categories
)
UPDATE public.asset_categories ac
SET sort_order = r.rn
FROM ranked r
WHERE ac.id = r.id;

CREATE INDEX IF NOT EXISTS idx_asset_categories_company_sort 
ON public.asset_categories(company_id, sort_order);
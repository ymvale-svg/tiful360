
-- Add a hard domain column to asset_categories.
ALTER TABLE public.asset_categories
  ADD COLUMN IF NOT EXISTS domain text;

-- Backfill using the legacy classification rules (mirrors classifyCategory() in code).
UPDATE public.asset_categories
SET domain = CASE
  WHEN prefix = 'VRT' OR protocol_type = 'digital' OR prefix = 'DACC' THEN 'digital'
  WHEN prefix = 'SFT' OR prefix = 'MAN' THEN 'licenses'
  WHEN protocol_type = 'real_estate' OR prefix = 'LEASE' THEN 'real_estate'
  WHEN protocol_type = 'insurance' OR prefix = 'CERT' OR prefix = 'CINS' THEN 'insurance'
  WHEN protocol_type = 'training' OR prefix = 'MAINT' THEN 'training'
  ELSE 'physical'
END
WHERE domain IS NULL;

-- Enforce the 6 fixed values and require the column going forward.
ALTER TABLE public.asset_categories
  ALTER COLUMN domain SET NOT NULL;

ALTER TABLE public.asset_categories
  ADD CONSTRAINT asset_categories_domain_check
  CHECK (domain IN ('physical','digital','licenses','training','insurance','real_estate'));

ALTER TABLE public.asset_categories
  ALTER COLUMN domain SET DEFAULT 'physical';

CREATE INDEX IF NOT EXISTS idx_asset_categories_domain
  ON public.asset_categories (company_id, domain, sort_order);

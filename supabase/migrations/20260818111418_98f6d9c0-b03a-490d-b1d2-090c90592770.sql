-- Onboarding sub-categories: default owner roles and editable domain labels

-- 1. Add default_owner_role to asset_categories
ALTER TABLE public.asset_categories
  ADD COLUMN IF NOT EXISTS default_owner_role text;

-- 2. Add default_owner_role to asset_groups
ALTER TABLE public.asset_groups
  ADD COLUMN IF NOT EXISTS default_owner_role text;

-- 3. Add editable domain labels to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS domain_labels jsonb DEFAULT '{}'::jsonb;

-- 4. Seed default owner roles based on current domain classification
UPDATE public.asset_categories
SET default_owner_role = CASE domain
  WHEN 'physical' THEN 'operations'
  WHEN 'digital' THEN 'it_manager'
  WHEN 'licenses' THEN 'operations'
  WHEN 'training' THEN 'hr'
  WHEN 'insurance' THEN 'operations'
  WHEN 'real_estate' THEN 'operations'
  ELSE 'operations'
END
WHERE default_owner_role IS NULL;

UPDATE public.asset_groups g
SET default_owner_role = COALESCE(
  (SELECT c.default_owner_role FROM public.asset_categories c WHERE c.id = g.category_id),
  'operations'
)
WHERE g.default_owner_role IS NULL;

-- 5. Ensure companies.domain_labels default is set
ALTER TABLE public.companies
  ALTER COLUMN domain_labels SET DEFAULT '{}'::jsonb;

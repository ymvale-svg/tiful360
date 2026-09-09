ALTER TABLE public.asset_groups
  ADD COLUMN IF NOT EXISTS is_vehicle_related boolean NOT NULL DEFAULT false;

UPDATE public.asset_groups ag
SET is_vehicle_related = true, updated_at = now()
FROM public.asset_categories ac
WHERE ac.id = ag.category_id
  AND ac.category_name = 'שירותי מנוי'
  AND ag.name IN ('פנגו', 'כביש 6', 'חוצה צפון', 'מנהרות הכרמל', 'כרטיס תדלוק סונול');

UPDATE public.category_fields cf
SET is_required = false
FROM public.asset_categories ac
WHERE ac.id = cf.category_id
  AND ac.category_name = 'שירותי מנוי'
  AND cf.field_name IN ('שם המנוי', 'שם החברה', 'סוג חידוש');
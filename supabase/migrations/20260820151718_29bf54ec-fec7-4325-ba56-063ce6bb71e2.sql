ALTER TABLE public.category_fields
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.asset_groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_category_fields_group_id ON public.category_fields(group_id);
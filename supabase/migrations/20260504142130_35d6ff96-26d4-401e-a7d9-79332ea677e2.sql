ALTER TABLE public.asset_categories
  ADD COLUMN IF NOT EXISTS skip_handover_form boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skip_return_form boolean NOT NULL DEFAULT false;
ALTER TABLE public.asset_handover_forms
  ADD COLUMN IF NOT EXISTS protocol_type text NOT NULL DEFAULT 'handover',
  ADD COLUMN IF NOT EXISTS protocol_subtype text;

CREATE INDEX IF NOT EXISTS idx_handover_forms_protocol_type
  ON public.asset_handover_forms(protocol_type);
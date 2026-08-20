-- Handover/return form enhancements
ALTER TABLE public.asset_handover_forms
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'handover',
  ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS odometer_km integer,
  ADD COLUMN IF NOT EXISTS selected_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS free_text text,
  ADD COLUMN IF NOT EXISTS issuer_signature text,
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.asset_groups(id) ON DELETE SET NULL;

-- Field defaults per category
ALTER TABLE public.asset_categories
  ADD COLUMN IF NOT EXISTS protocol_field_defaults jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Templates per sub-category
ALTER TABLE public.document_protocols
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.asset_groups(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS field_defaults jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP INDEX IF EXISTS public.document_protocols_unique_scope;
ALTER TABLE public.document_protocols
  DROP CONSTRAINT IF EXISTS document_protocols_company_id_protocol_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS document_protocols_unique_scope
  ON public.document_protocols (company_id, protocol_type, category_id, group_id)
  NULLS NOT DISTINCT;

-- Map legacy delivery methods to the unified module values
UPDATE public.asset_handover_forms SET delivery_method = 'on_site' WHERE delivery_method = 'manager_present';
UPDATE public.asset_handover_forms SET delivery_method = 'remote_sign' WHERE delivery_method = 'portal';
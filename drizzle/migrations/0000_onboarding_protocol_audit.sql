ALTER TABLE public.onboarding_processes
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS protocol_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS it_ticket_id uuid,
  ADD COLUMN IF NOT EXISTS audit_log jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.onboarding_items
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
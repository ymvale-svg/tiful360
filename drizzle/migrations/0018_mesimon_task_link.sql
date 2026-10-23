ALTER TABLE public.it_tickets
  ADD COLUMN IF NOT EXISTS mesimon_task_id text,
  ADD COLUMN IF NOT EXISTS mesimon_task_url text,
  ADD COLUMN IF NOT EXISTS mesimon_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS mesimon_sent_by uuid;
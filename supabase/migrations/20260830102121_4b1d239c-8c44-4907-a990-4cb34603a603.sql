ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS michpal_absence_codes jsonb NOT NULL
  DEFAULT '{"vacation":"1","sick":"2","reserve":"3","personal":"9","other":"9"}'::jsonb;
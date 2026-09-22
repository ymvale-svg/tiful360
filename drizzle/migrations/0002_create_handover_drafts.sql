CREATE TABLE public.handover_drafts (
  key text PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  has_media boolean NOT NULL DEFAULT false,
  saved_by uuid,
  saved_by_name text,
  saved_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.handover_drafts TO authenticated;
GRANT ALL ON public.handover_drafts TO service_role;

ALTER TABLE public.handover_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members read handover drafts"
ON public.handover_drafts FOR SELECT TO authenticated
USING (company_id IS NULL OR company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Company members insert handover drafts"
ON public.handover_drafts FOR INSERT TO authenticated
WITH CHECK (company_id IS NULL OR company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Company members update handover drafts"
ON public.handover_drafts FOR UPDATE TO authenticated
USING (company_id IS NULL OR company_id IN (SELECT public.user_company_ids(auth.uid())))
WITH CHECK (company_id IS NULL OR company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Company members delete handover drafts"
ON public.handover_drafts FOR DELETE TO authenticated
USING (company_id IS NULL OR company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE INDEX idx_handover_drafts_company ON public.handover_drafts(company_id);
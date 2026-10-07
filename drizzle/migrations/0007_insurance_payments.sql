CREATE TABLE public.insurance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  due_date date NOT NULL,
  amount numeric,
  note text,
  paid_at timestamptz,
  paid_by uuid,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX insurance_payments_asset_idx ON public.insurance_payments(asset_id);
CREATE INDEX insurance_payments_due_idx ON public.insurance_payments(due_date) WHERE paid_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_payments TO authenticated;
GRANT ALL ON public.insurance_payments TO service_role;
ALTER TABLE public.insurance_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company members manage insurance payments" ON public.insurance_payments
FOR ALL TO authenticated
USING (company_id IN (SELECT public.user_company_ids(auth.uid())))
WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));
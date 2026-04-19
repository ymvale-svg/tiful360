-- 1. Add columns to assets
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS manufacturer_model text,
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'good';

-- 2. Create handover forms table
CREATE TABLE IF NOT EXISTS public.asset_handover_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  delivery_method text NOT NULL DEFAULT 'portal', -- 'portal' | 'manager_present'
  status text NOT NULL DEFAULT 'pending',          -- 'pending' | 'signed' | 'cancelled'
  sign_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  form_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_data text,
  attached_document_url text,
  pdf_url text,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_handover_company ON public.asset_handover_forms(company_id);
CREATE INDEX IF NOT EXISTS idx_handover_employee ON public.asset_handover_forms(employee_id);
CREATE INDEX IF NOT EXISTS idx_handover_asset ON public.asset_handover_forms(asset_id);
CREATE INDEX IF NOT EXISTS idx_handover_token ON public.asset_handover_forms(sign_token);

ALTER TABLE public.asset_handover_forms ENABLE ROW LEVEL SECURITY;

-- Admins / IT view company forms
CREATE POLICY "Staff view company handover forms"
ON public.asset_handover_forms FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid()) OR (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
    AND company_id IN (SELECT user_company_ids(auth.uid()))
  )
);

-- Employee views own forms
CREATE POLICY "Employees view own handover forms"
ON public.asset_handover_forms FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = asset_handover_forms.employee_id
      AND e.linked_user_id = auth.uid()
  )
);

-- Admins / IT manage company forms (insert/update/delete)
CREATE POLICY "Staff insert company handover forms"
ON public.asset_handover_forms FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Staff update company handover forms"
ON public.asset_handover_forms FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Staff delete company handover forms"
ON public.asset_handover_forms FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- Employee can update own form (sign it)
CREATE POLICY "Employees update own pending handover forms"
ON public.asset_handover_forms FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = asset_handover_forms.employee_id
      AND e.linked_user_id = auth.uid()
  )
);

-- Public read by token (for /handover/:token page, no auth)
CREATE POLICY "Public read by sign token"
ON public.asset_handover_forms FOR SELECT TO anon, authenticated
USING (sign_token IS NOT NULL);

-- Public update by token
CREATE POLICY "Public update by sign token"
ON public.asset_handover_forms FOR UPDATE TO anon, authenticated
USING (sign_token IS NOT NULL AND status = 'pending');

-- 3. Storage bucket for handover documents (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('handover-forms', 'handover-forms', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated company staff + employee owner can read/write
CREATE POLICY "Authenticated read handover files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'handover-forms');

CREATE POLICY "Authenticated upload handover files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'handover-forms');

CREATE POLICY "Authenticated update handover files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'handover-forms');

CREATE POLICY "Authenticated delete handover files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'handover-forms' AND has_role(auth.uid(), 'admin'::app_role));

-- Allow anonymous upload via signed token flow (signature image / attachment)
CREATE POLICY "Anon upload handover files"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'handover-forms');

CREATE POLICY "Anon read handover files"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'handover-forms');
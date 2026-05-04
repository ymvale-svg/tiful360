
-- 1. asset_categories: is_assignable
ALTER TABLE public.asset_categories
  ADD COLUMN IF NOT EXISTS is_assignable BOOLEAN NOT NULL DEFAULT true;

-- 2. companies: operations_emails
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS operations_emails TEXT;

-- 3. asset_documents table
CREATE TABLE IF NOT EXISTS public.asset_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL,
  company_id UUID NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'other',
  document_label TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  expiry_date DATE,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_asset_documents_asset ON public.asset_documents(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_documents_company ON public.asset_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_asset_documents_expiry ON public.asset_documents(expiry_date) WHERE expiry_date IS NOT NULL;

ALTER TABLE public.asset_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view company asset documents" ON public.asset_documents;
CREATE POLICY "Users view company asset documents"
  ON public.asset_documents FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))));

DROP POLICY IF EXISTS "Staff manage company asset documents" ON public.asset_documents;
CREATE POLICY "Staff manage company asset documents"
  ON public.asset_documents FOR ALL TO authenticated
  USING ((has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role) OR is_operations(auth.uid()))
         AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid())))))
  WITH CHECK ((has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role) OR is_operations(auth.uid()))
         AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid())))));

-- 4. Storage bucket: asset-documents (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('asset-documents', 'asset-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Company users read asset-documents" ON storage.objects;
CREATE POLICY "Company users read asset-documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'asset-documents'
    AND (
      is_super_admin(auth.uid())
      OR ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Staff upload asset-documents" ON storage.objects;
CREATE POLICY "Staff upload asset-documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'asset-documents'
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role) OR is_operations(auth.uid()))
    AND (
      is_super_admin(auth.uid())
      OR ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Staff update asset-documents" ON storage.objects;
CREATE POLICY "Staff update asset-documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'asset-documents'
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role) OR is_operations(auth.uid()))
    AND (
      is_super_admin(auth.uid())
      OR ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Staff delete asset-documents" ON storage.objects;
CREATE POLICY "Staff delete asset-documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'asset-documents'
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role) OR is_operations(auth.uid()))
    AND (
      is_super_admin(auth.uid())
      OR ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid()))
    )
  );

-- 5. get_expiring_assets function
CREATE OR REPLACE FUNCTION public.get_expiring_assets(_company_id UUID, _days_ahead INT DEFAULT 14)
RETURNS TABLE (
  asset_id UUID,
  asset_name TEXT,
  asset_code TEXT,
  category_id UUID,
  category_name TEXT,
  category_prefix TEXT,
  is_assignable BOOLEAN,
  source_type TEXT,
  source_id UUID,
  field_key TEXT,
  field_label TEXT,
  expiry_date DATE,
  days_left INT,
  current_owner_id UUID,
  owner_name TEXT,
  custom_fields JSONB
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR _company_id IN (SELECT public.user_company_ids(auth.uid()))) THEN
    RETURN;
  END IF;

  RETURN QUERY
  -- A) main expiry_date
  SELECT
    a.id, a.asset_name, a.asset_code,
    c.id, c.category_name, c.prefix, c.is_assignable,
    'asset'::text, a.id, NULL::text, 'תאריך תפוגה'::text,
    a.expiry_date,
    (a.expiry_date - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name,
    a.custom_fields
  FROM public.assets a
  JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id
    AND a.expiry_date IS NOT NULL
    AND a.expiry_date - CURRENT_DATE <= _days_ahead

  UNION ALL

  -- B) custom date fields whose name matches expiry-related keywords
  SELECT
    a.id, a.asset_name, a.asset_code,
    c.id, c.category_name, c.prefix, c.is_assignable,
    'custom_field'::text, a.id, cf.id::text || ':' || cf.field_name, cf.field_name,
    (a.custom_fields->>cf.field_name)::date,
    ((a.custom_fields->>cf.field_name)::date - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name,
    a.custom_fields
  FROM public.assets a
  JOIN public.asset_categories c ON c.id = a.category_id
  JOIN public.category_fields cf ON cf.category_id = c.id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE a.company_id = _company_id
    AND cf.field_type = 'date'::field_type
    AND cf.field_name ~* 'תפוגה|תוקף|טסט|ביטוח|טיפול|רישיון|חוזה'
    AND a.custom_fields ? cf.field_name
    AND (a.custom_fields->>cf.field_name) ~ '^\d{4}-\d{2}-\d{2}$'
    AND ((a.custom_fields->>cf.field_name)::date - CURRENT_DATE) <= _days_ahead

  UNION ALL

  -- C) document expiries
  SELECT
    a.id, a.asset_name, a.asset_code,
    c.id, c.category_name, c.prefix, c.is_assignable,
    'document'::text, d.id, d.document_type,
    COALESCE(d.document_label, d.file_name),
    d.expiry_date,
    (d.expiry_date - CURRENT_DATE)::int,
    a.current_owner_id, e.full_name,
    a.custom_fields
  FROM public.asset_documents d
  JOIN public.assets a ON a.id = d.asset_id
  JOIN public.asset_categories c ON c.id = a.category_id
  LEFT JOIN public.employees e ON e.id = a.current_owner_id
  WHERE d.company_id = _company_id
    AND d.expiry_date IS NOT NULL
    AND (d.expiry_date - CURRENT_DATE) <= _days_ahead

  ORDER BY 11 ASC NULLS LAST;
END;
$$;

-- 6. updated_at trigger for asset_documents
DROP TRIGGER IF EXISTS trg_asset_documents_updated ON public.asset_documents;

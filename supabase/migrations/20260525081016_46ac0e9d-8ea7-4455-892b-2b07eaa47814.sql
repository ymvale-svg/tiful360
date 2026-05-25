
ALTER TABLE public.document_protocols
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.asset_categories(id) ON DELETE CASCADE;

-- Drop old unique constraint if exists
DROP INDEX IF EXISTS document_protocols_company_protocol_unique;
DROP INDEX IF EXISTS document_protocols_unique_scope;

CREATE UNIQUE INDEX document_protocols_unique_scope
  ON public.document_protocols (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    protocol_type,
    COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Replace RLS policies
DROP POLICY IF EXISTS "Anyone authenticated reads protocols" ON public.document_protocols;
DROP POLICY IF EXISTS "Super admin manages protocols" ON public.document_protocols;
DROP POLICY IF EXISTS "Authenticated read protocols" ON public.document_protocols;
DROP POLICY IF EXISTS "Company staff manage company protocols" ON public.document_protocols;
DROP POLICY IF EXISTS "Super admin manages global protocols" ON public.document_protocols;

CREATE POLICY "Authenticated read protocols"
  ON public.document_protocols FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Company staff manage company protocols"
  ON public.document_protocols FOR ALL
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND (has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()))
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND (has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()))
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

CREATE POLICY "Super admin manages global protocols"
  ON public.document_protocols FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

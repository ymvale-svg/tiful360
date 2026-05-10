-- is_legal() helper
CREATE OR REPLACE FUNCTION public.is_legal(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND (role = 'legal'::app_role OR role = 'super_admin'::app_role)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_legal(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_legal(uuid) TO authenticated;

-- =====================================================
-- assets: Legal can manage institutional (is_assignable=false) assets
-- =====================================================
CREATE POLICY "Legal manage company institutional assets"
ON public.assets
FOR ALL
TO authenticated
USING (
  public.is_legal(auth.uid())
  AND (public.is_super_admin(auth.uid()) OR (company_id IN (SELECT public.user_company_ids(auth.uid()))))
  AND EXISTS (
    SELECT 1 FROM public.asset_categories c
    WHERE c.id = assets.category_id AND c.is_assignable = false
  )
)
WITH CHECK (
  public.is_legal(auth.uid())
  AND (public.is_super_admin(auth.uid()) OR (company_id IN (SELECT public.user_company_ids(auth.uid()))))
  AND EXISTS (
    SELECT 1 FROM public.asset_categories c
    WHERE c.id = assets.category_id AND c.is_assignable = false
  )
);

-- =====================================================
-- asset_categories: Legal can manage non-assignable (institutional) categories
-- =====================================================
CREATE POLICY "Legal manage company institutional categories"
ON public.asset_categories
FOR ALL
TO authenticated
USING (
  public.is_legal(auth.uid())
  AND (public.is_super_admin(auth.uid()) OR (company_id IN (SELECT public.user_company_ids(auth.uid()))))
  AND is_assignable = false
)
WITH CHECK (
  public.is_legal(auth.uid())
  AND (public.is_super_admin(auth.uid()) OR (company_id IN (SELECT public.user_company_ids(auth.uid()))))
  AND is_assignable = false
);

-- =====================================================
-- category_fields: Legal can manage fields belonging to institutional categories
-- =====================================================
CREATE POLICY "Legal manage company institutional category fields"
ON public.category_fields
FOR ALL
TO authenticated
USING (
  public.is_legal(auth.uid())
  AND (public.is_super_admin(auth.uid()) OR (company_id IN (SELECT public.user_company_ids(auth.uid()))))
  AND EXISTS (
    SELECT 1 FROM public.asset_categories c
    WHERE c.id = category_fields.category_id AND c.is_assignable = false
  )
)
WITH CHECK (
  public.is_legal(auth.uid())
  AND (public.is_super_admin(auth.uid()) OR (company_id IN (SELECT public.user_company_ids(auth.uid()))))
  AND EXISTS (
    SELECT 1 FROM public.asset_categories c
    WHERE c.id = category_fields.category_id AND c.is_assignable = false
  )
);

-- =====================================================
-- asset_documents: Legal can manage documents for institutional assets
-- =====================================================
CREATE POLICY "Legal manage company institutional asset documents"
ON public.asset_documents
FOR ALL
TO authenticated
USING (
  public.is_legal(auth.uid())
  AND (public.is_super_admin(auth.uid()) OR (company_id IN (SELECT public.user_company_ids(auth.uid()))))
  AND EXISTS (
    SELECT 1 FROM public.assets a
    JOIN public.asset_categories c ON c.id = a.category_id
    WHERE a.id = asset_documents.asset_id AND c.is_assignable = false
  )
)
WITH CHECK (
  public.is_legal(auth.uid())
  AND (public.is_super_admin(auth.uid()) OR (company_id IN (SELECT public.user_company_ids(auth.uid()))))
  AND EXISTS (
    SELECT 1 FROM public.assets a
    JOIN public.asset_categories c ON c.id = a.category_id
    WHERE a.id = asset_documents.asset_id AND c.is_assignable = false
  )
);

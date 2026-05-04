-- 1. Fix digital_access SELECT policy
DROP POLICY IF EXISTS "Users view company digital access" ON public.digital_access;

CREATE POLICY "Staff view company digital access"
ON public.digital_access
FOR SELECT
USING (
  (is_super_admin(auth.uid())
   OR has_role(auth.uid(), 'admin'::app_role)
   OR has_role(auth.uid(), 'it_manager'::app_role)
   OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
);

CREATE POLICY "Employees view own digital access"
ON public.digital_access
FOR SELECT
USING (
  employee_id IN (
    SELECT id FROM public.employees WHERE linked_user_id = auth.uid()
  )
);

-- 2. Fix user_roles INSERT/UPDATE - exclude it_manager from operations
DROP POLICY IF EXISTS "Staff insert company user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Staff update company user roles" ON public.user_roles;

CREATE POLICY "Staff insert company user roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'super_admin'::app_role
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
  OR (
    is_operations(auth.uid())
    AND role <> ALL (ARRAY['super_admin'::app_role, 'admin'::app_role, 'payroll'::app_role, 'it_manager'::app_role, 'operations'::app_role])
    AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
);

CREATE POLICY "Staff update company user roles"
ON public.user_roles
FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
  OR (
    is_operations(auth.uid())
    AND role <> ALL (ARRAY['super_admin'::app_role, 'admin'::app_role, 'payroll'::app_role, 'it_manager'::app_role, 'operations'::app_role])
    AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role) AND role <> 'super_admin'::app_role)
  OR (
    is_operations(auth.uid())
    AND role <> ALL (ARRAY['super_admin'::app_role, 'admin'::app_role, 'payroll'::app_role, 'it_manager'::app_role, 'operations'::app_role])
    AND user_id <> auth.uid()
  )
);

-- 3. Fix function search_path
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;

-- 4. Restrict public bucket listing to authenticated users (public URLs still work)
DROP POLICY IF EXISTS "Public read access for email assets" ON storage.objects;
CREATE POLICY "Authenticated list email assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'email-assets'::text);

DROP POLICY IF EXISTS "Authenticated read handover files" ON storage.objects;
CREATE POLICY "Authenticated list handover files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'handover-forms'::text);

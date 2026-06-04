
-- 1) document_protocols: restrict SELECT to super_admin, global (null company), or same-company
DROP POLICY IF EXISTS "Authenticated read protocols" ON public.document_protocols;
CREATE POLICY "Authenticated read protocols"
  ON public.document_protocols FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL
    OR is_super_admin(auth.uid())
    OR company_id IN (SELECT user_company_ids(auth.uid()))
  );

-- 2) user_roles: add company-scope check to UPDATE policy
DROP POLICY IF EXISTS "Staff update company user roles" ON public.user_roles;
CREATE POLICY "Staff update company user roles"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND role <> ALL (ARRAY['super_admin'::app_role, 'payroll'::app_role, 'it_manager'::app_role])
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
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND role <> ALL (ARRAY['super_admin'::app_role, 'admin'::app_role, 'payroll'::app_role, 'it_manager'::app_role])
      AND user_id <> auth.uid()
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

-- 3) Storage: scope admin leave file access to admin's own company via employee lookup
DROP POLICY IF EXISTS "Company admins can manage all leave attachments" ON storage.objects;
CREATE POLICY "Company admins can manage all leave attachments"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'leave-attachments'
    AND (
      is_super_admin(auth.uid())
      OR (
        (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = ((storage.foldername(name))[1])::uuid
            AND e.company_id IN (SELECT public.user_company_ids(auth.uid()))
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'leave-attachments'
    AND (
      is_super_admin(auth.uid())
      OR (
        (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = ((storage.foldername(name))[1])::uuid
            AND e.company_id IN (SELECT public.user_company_ids(auth.uid()))
        )
      )
    )
  );

DROP POLICY IF EXISTS "Company admins can manage all leave documents" ON storage.objects;
CREATE POLICY "Company admins can manage all leave documents"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'leave-documents'
    AND (
      is_super_admin(auth.uid())
      OR (
        (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = ((storage.foldername(name))[1])::uuid
            AND e.company_id IN (SELECT public.user_company_ids(auth.uid()))
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'leave-documents'
    AND (
      is_super_admin(auth.uid())
      OR (
        (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = ((storage.foldername(name))[1])::uuid
            AND e.company_id IN (SELECT public.user_company_ids(auth.uid()))
        )
      )
    )
  );

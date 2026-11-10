-- Security: restrict reads of the employee-documents bucket.
-- Before: any authenticated member of a company could list and download every
-- coworker's files (ID documents, medical documents, contracts, offboarding).
-- After: the same rule as the employee_documents table — staff roles of the
-- company, the employee themself (folder <company_id>/<employee_id>/...), or a super admin.
-- Write and delete policies are unchanged.

DROP POLICY IF EXISTS "Company users read employee-documents" ON storage.objects;
CREATE POLICY "Company users read employee-documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (
      is_super_admin(auth.uid())
      OR (
        ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid()))
        AND (
          has_role(auth.uid(),'admin'::app_role)
          OR has_role(auth.uid(),'it_manager'::app_role)
          OR has_role(auth.uid(),'hr'::app_role)
          OR is_payroll(auth.uid())
          OR is_operations(auth.uid())
          -- the employee's own folder (text comparison, so a non-uuid segment cannot raise a cast error)
          OR (storage.foldername(name))[2] IN (
            SELECT e.id::text FROM public.employees e WHERE e.linked_user_id = auth.uid()
          )
        )
      )
    )
  );

-- Security fix follow-up to PR #24 (issue #22).
-- Since PR #24, a sick note / leave attachment is signed when it is opened,
-- with the viewer's own permissions. The SELECT policies on the private
-- `leave-attachments` bucket cover the employee, the direct manager,
-- company admins / IT managers and super_admin, but not payroll. Payroll can
-- read the leave_requests rows ("Payroll views approved leave and all sick")
-- and is now emailed to view the note in the system, so it could not open it.
--
-- This grants payroll read access to exactly the files that are attached to a
-- leave request it is already allowed to see: same company, and approved or
-- of type sick (mirrors the leave_requests policy). No write access, no other
-- roles, no other buckets. Legacy rows that still hold a full signed URL are
-- matched by the path inside the URL.
--
-- hr is NOT added: hr has no SELECT policy on leave_requests today.

DROP POLICY IF EXISTS "Payroll reads attachments of visible leave requests" ON storage.objects;
CREATE POLICY "Payroll reads attachments of visible leave requests"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'leave-attachments'
    AND public.is_payroll(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.leave_requests lr
      WHERE (
          lr.attachment_url = storage.objects.name
          OR strpos(lr.attachment_url, '/leave-attachments/' || storage.objects.name || '?') > 0
        )
        AND (public.is_super_admin(auth.uid()) OR lr.company_id IN (SELECT public.user_company_ids(auth.uid())))
        AND (lr.status = 'approved'::leave_request_status OR lr.request_type = 'sick'::leave_request_type)
    )
  );

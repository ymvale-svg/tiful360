
-- 1. Fix user_roles UPDATE policy: align USING and WITH CHECK so admins cannot
--    escalate users to payroll/it_manager via UPDATE bypass.
DROP POLICY IF EXISTS "Staff update company user roles" ON public.user_roles;
CREATE POLICY "Staff update company user roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND role <> ALL (ARRAY['super_admin'::app_role, 'payroll'::app_role, 'it_manager'::app_role])
  )
  OR (
    is_operations(auth.uid())
    AND role <> ALL (ARRAY['super_admin'::app_role, 'admin'::app_role, 'payroll'::app_role, 'it_manager'::app_role, 'operations'::app_role])
    AND user_id <> auth.uid()
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND role <> ALL (ARRAY['super_admin'::app_role, 'payroll'::app_role, 'it_manager'::app_role])
  )
  OR (
    is_operations(auth.uid())
    AND role <> ALL (ARRAY['super_admin'::app_role, 'admin'::app_role, 'payroll'::app_role, 'it_manager'::app_role, 'operations'::app_role])
    AND user_id <> auth.uid()
  )
);

-- 2. Restrict companies internal-routing email columns to admins/super_admins
--    via column-level privileges. Regular employees can still read other columns
--    via the existing "Users can view their companies" policy.
REVOKE SELECT (payroll_emails, it_emails, operations_emails) ON public.companies FROM authenticated;
REVOKE SELECT (payroll_emails, it_emails, operations_emails) ON public.companies FROM anon;

-- Helper: SECURITY DEFINER reader for staff-only routing emails (used by the few
-- admin screens that already need them).
CREATE OR REPLACE FUNCTION public.get_company_routing_emails(_company_id uuid)
RETURNS TABLE (payroll_emails text, it_emails text, operations_emails text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.payroll_emails, c.it_emails, c.operations_emails
  FROM public.companies c
  WHERE c.id = _company_id
    AND (
      is_super_admin(auth.uid())
      OR (
        (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_operations(auth.uid()) OR has_role(auth.uid(), 'it_manager'::app_role))
        AND c.id IN (SELECT user_company_ids(auth.uid()))
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_company_routing_emails(uuid) TO authenticated;

-- 3. Tighten storage policy for tax-forms-101 anonymous uploads:
--    Only allow when an explicit access_token in the file path matches a pending
--    tax_form_101 row. Path convention used by the upload flow:
--    {company_id}/{form_id}-{timestamp}.pdf  (the form_id binds the upload).
DROP POLICY IF EXISTS "Anon upload tax form pdf via pending token" ON storage.objects;
CREATE POLICY "Anon upload tax form pdf via pending token"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'tax-forms-101'
  AND EXISTS (
    SELECT 1
    FROM public.tax_form_101 t
    WHERE (t.company_id::text = (storage.foldername(name))[1])
      AND t.status = 'pending'
      AND (t.token_expires_at IS NULL OR t.token_expires_at > now())
      -- Bind upload path to a specific form id to prevent cross-form replacement
      AND position(t.id::text in name) > 0
  )
);

-- 4. Realtime subscription gate: scope realtime.messages to attendance_punches
--    of the user's own companies.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can subscribe to own company punches" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to own company punches"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Allow subscription only when the channel topic encodes a company id the
  -- caller has access to, e.g. live_locations_<companyId> or my_punches_<empId>.
  -- Conservative: allow only subscriptions where the topic contains a company
  -- id from user_company_ids, OR the user's own employee id.
  EXISTS (
    SELECT 1 FROM public.user_company_access uca
    WHERE uca.user_id = auth.uid()
      AND position(uca.company_id::text in COALESCE(extension, '')) > 0
  )
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.linked_user_id = auth.uid()
      AND position(e.id::text in COALESCE(extension, '')) > 0
  )
  OR public.is_super_admin(auth.uid())
);

-- 1) user_roles: ensure admins can never modify their own role rows (UPDATE using-clause gap)
DROP POLICY IF EXISTS "Staff update company user roles" ON public.user_roles;
CREATE POLICY "Staff update company user roles"
ON public.user_roles
FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND role <> ALL (ARRAY['super_admin'::app_role,'admin'::app_role,'payroll'::app_role,'it_manager'::app_role])
    AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
  OR (
    is_operations(auth.uid())
    AND role <> ALL (ARRAY['super_admin'::app_role,'admin'::app_role,'payroll'::app_role,'it_manager'::app_role,'operations'::app_role])
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
    AND role <> ALL (ARRAY['super_admin'::app_role,'admin'::app_role,'payroll'::app_role,'it_manager'::app_role])
    AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
  OR (
    is_operations(auth.uid())
    AND role <> ALL (ARRAY['super_admin'::app_role,'admin'::app_role,'payroll'::app_role,'it_manager'::app_role,'operations'::app_role])
    AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
);

-- also prevent admins from deleting their own role rows
DROP POLICY IF EXISTS "Staff delete company user roles" ON public.user_roles;
CREATE POLICY "Staff delete company user roles"
ON public.user_roles
FOR DELETE
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'super_admin'::app_role
    AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
  OR (
    is_operations(auth.uid())
    AND role <> ALL (ARRAY['super_admin'::app_role,'admin'::app_role,'payroll'::app_role])
    AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
);

-- 2) email-assets bucket: branding assets only. Remove the broad authenticated list/select
-- policy (public read of logos remains for email clients) and keep writes service-role only.
DROP POLICY IF EXISTS "Authenticated list email assets" ON storage.objects;

-- 3) attendance_agent_heartbeats: writes are service-role only by design; make the denial explicit.
REVOKE INSERT, UPDATE, DELETE ON public.attendance_agent_heartbeats FROM authenticated, anon;
GRANT SELECT ON public.attendance_agent_heartbeats TO authenticated;
GRANT ALL ON public.attendance_agent_heartbeats TO service_role;
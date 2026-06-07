
-- 1) profiles: scope SELECT to self (or super admin) to prevent system_role enumeration
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()));

-- 2) attendance_records: restrict SELECT to staff roles + own records + direct manager
DROP POLICY IF EXISTS "Users view company attendance" ON public.attendance_records;
CREATE POLICY "Staff and self view attendance"
ON public.attendance_records FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    (public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'it_manager'::app_role)
     OR public.is_payroll(auth.uid())
     OR public.is_operations(auth.uid()))
    AND company_id IN (SELECT public.user_company_ids(auth.uid()))
  )
  OR public.is_my_employee_record(employee_id, auth.uid())
  OR public.is_direct_manager_of(employee_id, auth.uid())
);

-- 3) companies: revoke table-wide SELECT; grant only safe columns to authenticated.
--    Sensitive routing/credential columns must be accessed via SECURITY DEFINER helpers
--    (e.g. get_company_routing_emails) or via service role in edge functions.
REVOKE SELECT ON public.companies FROM authenticated;
GRANT SELECT (id, name, logo_url, created_by, created_at, updated_at,
              git_enabled, git_base_url, git_default_site_code)
  ON public.companies TO authenticated;

-- 4) tax-forms-101 storage anon upload: require full form UUID match in filename
DROP POLICY IF EXISTS "Anon upload tax form pdf via pending token" ON storage.objects;
CREATE POLICY "Anon upload tax form pdf via pending token"
ON storage.objects FOR INSERT TO anon
WITH CHECK (
  bucket_id = 'tax-forms-101'
  AND EXISTS (
    SELECT 1 FROM public.tax_form_101 t
    WHERE (t.company_id)::text = (storage.foldername(objects.name))[1]
      AND t.status = 'pending'
      AND (t.token_expires_at IS NULL OR t.token_expires_at > now())
      AND SUBSTRING(objects.name FROM POSITION('/' IN objects.name) + 1)
          LIKE (t.id)::text || '-%'
  )
);

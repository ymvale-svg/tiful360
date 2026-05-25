
-- 1. activity_log: restrict SELECT to staff roles
DROP POLICY IF EXISTS "Users view company activity log" ON public.activity_log;
CREATE POLICY "Staff view company activity log"
ON public.activity_log
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    (has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'it_manager'::app_role)
      OR is_operations(auth.uid()))
    AND company_id IN (SELECT user_company_ids(auth.uid()))
  )
);

-- 2. it_tickets: staff see all, employees see only their own
DROP POLICY IF EXISTS "Users view company tickets" ON public.it_tickets;
CREATE POLICY "Staff view company tickets"
ON public.it_tickets
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    (has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'it_manager'::app_role)
      OR is_operations(auth.uid()))
    AND company_id IN (SELECT user_company_ids(auth.uid()))
  )
);
CREATE POLICY "Employees view own tickets"
ON public.it_tickets
FOR SELECT
TO authenticated
USING (
  employee_id IN (
    SELECT id FROM public.employees WHERE linked_user_id = auth.uid()
  )
);

-- 3. sub_employers: restrict SELECT to admin/payroll/finance
DROP POLICY IF EXISTS "Users view company sub_employers" ON public.sub_employers;
CREATE POLICY "Staff view company sub_employers"
ON public.sub_employers
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    (has_role(auth.uid(), 'admin'::app_role)
      OR is_payroll(auth.uid())
      OR has_role(auth.uid(), 'finance'::app_role))
    AND company_id IN (SELECT user_company_ids(auth.uid()))
  )
);

-- 4. user_roles: ensure non-super-admins cannot UPDATE or INSERT a privileged new role value
DROP POLICY IF EXISTS "Staff update company user roles" ON public.user_roles;
CREATE POLICY "Staff update company user roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role)
      AND role <> ALL (ARRAY['super_admin'::app_role, 'payroll'::app_role, 'it_manager'::app_role]))
  OR (is_operations(auth.uid())
      AND role <> ALL (ARRAY['super_admin'::app_role,'admin'::app_role,'payroll'::app_role,'it_manager'::app_role,'operations'::app_role])
      AND user_id <> auth.uid())
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role)
      AND role <> ALL (ARRAY['super_admin'::app_role, 'admin'::app_role, 'payroll'::app_role, 'it_manager'::app_role])
      AND user_id <> auth.uid())
  OR (is_operations(auth.uid())
      AND role <> ALL (ARRAY['super_admin'::app_role,'admin'::app_role,'payroll'::app_role,'it_manager'::app_role,'operations'::app_role])
      AND user_id <> auth.uid())
);

DROP POLICY IF EXISTS "Staff insert company user roles" ON public.user_roles;
CREATE POLICY "Staff insert company user roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role)
      AND role <> ALL (ARRAY['super_admin'::app_role,'admin'::app_role,'payroll'::app_role,'it_manager'::app_role])
      AND user_id <> auth.uid()
      AND EXISTS (
        SELECT 1 FROM user_company_access uca1
        JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
        WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
      ))
  OR (is_operations(auth.uid())
      AND role <> ALL (ARRAY['super_admin'::app_role,'admin'::app_role,'payroll'::app_role,'it_manager'::app_role,'operations'::app_role])
      AND user_id <> auth.uid()
      AND EXISTS (
        SELECT 1 FROM user_company_access uca1
        JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
        WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
      ))
);

-- 5. tax-forms-101 storage: enforce strict path pattern company_id/{formId}-*.pdf
DROP POLICY IF EXISTS "Anon upload tax form pdf via pending token" ON storage.objects;
CREATE POLICY "Anon upload tax form pdf via pending token"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'tax-forms-101'
  AND EXISTS (
    SELECT 1 FROM public.tax_form_101 t
    WHERE t.company_id::text = (storage.foldername(objects.name))[1]
      AND t.status = 'pending'
      AND (t.token_expires_at IS NULL OR t.token_expires_at > now())
      AND split_part(
            substring(objects.name from position('/' in objects.name) + 1),
            '-', 1
          ) = t.id::text
  )
);

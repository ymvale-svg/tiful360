-- Permission-group management checks the caller's role in the SAME company.
--
-- can_manage_permission_groups() / can_manage_group_members() used the global user_roles
-- (the cross-company union of all group roles) plus "has any access to the company". So an
-- admin/HR/payroll of company A who is only a plain user in company B could manage B's groups
-- and memberships. The role must now come from the caller's permission-group memberships in
-- that company. Since 20261104090000_permission_groups every management role is granted
-- through the company's groups (that migration backfilled today's roles as memberships in
-- every company the user could access), so admins/HR/payroll keep managing their own company.
-- super_admin is unchanged. Signatures, SECURITY DEFINER, search_path and grants are unchanged.

-- Who may create/edit/delete groups in a company: super admin, or an admin OF THAT company.
CREATE OR REPLACE FUNCTION public.can_manage_permission_groups(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid())
    OR (EXISTS (SELECT 1
                FROM public.permission_group_members m
                JOIN public.permission_groups g ON g.id = m.group_id
                WHERE m.user_id = auth.uid()
                  AND g.company_id = _company_id
                  AND 'admin'::public.app_role = ANY (g.roles))
        AND _company_id IN (SELECT public.user_company_ids(auth.uid())))
$$;

-- Who may add/remove members in a company: super admin, or admin/HR/payroll OF THAT company.
CREATE OR REPLACE FUNCTION public.can_manage_group_members(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid())
    OR (EXISTS (SELECT 1
                FROM public.permission_group_members m
                JOIN public.permission_groups g ON g.id = m.group_id
                WHERE m.user_id = auth.uid()
                  AND g.company_id = _company_id
                  AND g.roles && ARRAY['admin', 'hr', 'payroll']::public.app_role[])
        AND _company_id IN (SELECT public.user_company_ids(auth.uid())))
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_permission_groups(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_group_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_permission_groups(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_group_members(uuid) TO authenticated, service_role;

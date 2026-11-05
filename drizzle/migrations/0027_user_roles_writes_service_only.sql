-- Security fix (security-guard 2026-11-05):
-- appsec:user-roles-direct-insert-bypasses-group-guard
--
-- Since 0026_permission_groups, roles are granted only through permission groups:
-- a membership change runs permission_group_members_guard (only super_admin may grant
-- hr / payroll / admin / it_manager) and sync_user_roles_from_groups (SECURITY DEFINER)
-- derives public.user_roles. manage-users writes super_admin / employee rows with the
-- service role. No client code writes user_roles (it only SELECTs).
--
-- The older "Staff insert/update/delete company user roles" policies were never dropped,
-- so a company admin (or operations user) could still write a role such as 'hr' straight
-- into user_roles through the REST API for another user in a shared company. Because
-- is_payroll() now includes hr, that grants payroll-level access (sick notes, attendance
-- and leave writes, live location) and skips the group guard and the group screens.
--
-- This removes the direct-write policies for signed-in users. SELECT policies are kept.
-- The service role and SECURITY DEFINER functions are not affected by RLS.
DROP POLICY IF EXISTS "Staff insert company user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Staff update company user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Staff delete company user roles" ON public.user_roles;
-- Older names, in case a database still has them.
DROP POLICY IF EXISTS "Admins can insert company user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update company user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete company user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

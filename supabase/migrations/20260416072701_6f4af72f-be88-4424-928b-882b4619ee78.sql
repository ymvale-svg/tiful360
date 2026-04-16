
-- 1. Fix delete_company_cascade: add super_admin check
CREATE OR REPLACE FUNCTION public.delete_company_cascade(_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only super_admin can execute this
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super_admin only';
  END IF;

  DELETE FROM public.attendance_records WHERE company_id = _company_id;
  DELETE FROM public.it_tickets WHERE company_id = _company_id;
  DELETE FROM public.digital_access WHERE company_id = _company_id;
  DELETE FROM public.activity_log WHERE company_id = _company_id;
  DELETE FROM public.alerts WHERE company_id = _company_id;
  DELETE FROM public.announcements WHERE company_id = _company_id;
  DELETE FROM public.knowledge_base WHERE company_id = _company_id;
  DELETE FROM public.portal_contacts WHERE company_id = _company_id;
  DELETE FROM public.portal_links WHERE company_id = _company_id;
  DELETE FROM public.category_fields WHERE company_id = _company_id;
  DELETE FROM public.assets WHERE company_id = _company_id;
  DELETE FROM public.asset_categories WHERE company_id = _company_id;
  DELETE FROM public.employees WHERE company_id = _company_id;
  DELETE FROM public.user_company_access WHERE company_id = _company_id;
  DELETE FROM public.companies WHERE id = _company_id;
END;
$function$;

-- 2. Fix user_roles RLS: scope admin access to same-company users only
-- Drop existing overly-broad admin policies
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Admin can SELECT roles only for users in the same companies
CREATE POLICY "Admins can view company user roles" ON public.user_roles
FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.user_company_access uca1
      JOIN public.user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
);

-- Admin can INSERT roles only for users in same companies, and cannot assign super_admin
CREATE POLICY "Admins can insert company user roles" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND role != 'super_admin'::app_role
    AND EXISTS (
      SELECT 1 FROM public.user_company_access uca1
      JOIN public.user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
);

-- Admin can UPDATE roles only for users in same companies, and cannot set super_admin
CREATE POLICY "Admins can update company user roles" ON public.user_roles
FOR UPDATE TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.user_company_access uca1
      JOIN public.user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
)
WITH CHECK (
  is_super_admin(auth.uid()) OR role != 'super_admin'::app_role
);

-- Admin can DELETE roles only for users in same companies, and cannot remove super_admin
CREATE POLICY "Admins can delete company user roles" ON public.user_roles
FOR DELETE TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND role != 'super_admin'::app_role
    AND EXISTS (
      SELECT 1 FROM public.user_company_access uca1
      JOIN public.user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
);

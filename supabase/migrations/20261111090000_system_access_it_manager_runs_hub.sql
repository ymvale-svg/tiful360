-- IT managers work access requests like company admins: they dispatch, execute and reject any
-- open grant (including new onboarding requests from HR), within their own company only.
CREATE OR REPLACE FUNCTION public.system_access_is_manager(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(auth.uid())
    OR (
      (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'it_manager'::app_role))
      AND _company_id IN (SELECT public.user_company_ids(auth.uid()))
    );
$$;

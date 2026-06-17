
-- ============================================================
-- 1) companies: restrict sensitive columns at the GRANT level
-- ============================================================
REVOKE SELECT, UPDATE, INSERT ON public.companies FROM authenticated;
REVOKE SELECT, UPDATE, INSERT ON public.companies FROM anon;

GRANT SELECT (
  id, name, logo_url, created_by, created_at, updated_at,
  git_enabled, git_default_site_code,
  portal_name, portal_logo_url, portal_primary_color,
  attendance_corrections_auto_approve
) ON public.companies TO authenticated;

GRANT UPDATE (
  name, logo_url,
  portal_name, portal_logo_url, portal_primary_color
) ON public.companies TO authenticated;

GRANT INSERT (
  name, logo_url, created_by,
  portal_name, portal_logo_url, portal_primary_color
) ON public.companies TO authenticated;

GRANT DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

-- ============================================================
-- 2) RPC: privileged update of routing email columns
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_company_routing_emails(
  _company_id uuid,
  _column text,
  _emails text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _column NOT IN ('payroll_emails','it_emails','operations_emails','expiry_notification_emails') THEN
    RAISE EXCEPTION 'Invalid column %', _column;
  END IF;
  IF NOT (
    public.is_super_admin(v_uid)
    OR (
      (public.has_role(v_uid,'admin'::app_role)
       OR public.is_payroll(v_uid)
       OR public.is_operations(v_uid)
       OR public.has_role(v_uid,'it_manager'::app_role))
      AND _company_id IN (SELECT public.user_company_ids(v_uid))
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  EXECUTE format('UPDATE public.companies SET %I = $1, updated_at = now() WHERE id = $2', _column)
    USING NULLIF(_emails, ''), _company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_company_routing_emails(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_company_routing_emails(uuid, text, text) TO authenticated;

-- ============================================================
-- 3) profiles: prevent users from changing their own system_role
-- ============================================================
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND system_role = (SELECT system_role FROM public.profiles WHERE user_id = auth.uid())
);

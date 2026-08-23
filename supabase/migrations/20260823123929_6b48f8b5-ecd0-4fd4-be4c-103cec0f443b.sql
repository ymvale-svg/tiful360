ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS sender_role text;

CREATE OR REPLACE FUNCTION public.can_manage_announcements(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id)
      OR public.is_company_admin(_user_id, _company_id)
      OR (
        _company_id IN (SELECT public.user_company_ids(_user_id))
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = _user_id
            AND ur.role IN ('admin'::app_role, 'ceo'::app_role, 'operations'::app_role, 'hr'::app_role, 'secretariat'::app_role)
        )
      )
$$;

DROP POLICY IF EXISTS "Admins manage company announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;

CREATE POLICY "Managers insert company announcements" ON public.announcements
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_announcements(auth.uid(), company_id));

CREATE POLICY "Managers update company announcements" ON public.announcements
  FOR UPDATE TO authenticated
  USING (public.can_manage_announcements(auth.uid(), company_id))
  WITH CHECK (public.can_manage_announcements(auth.uid(), company_id));

CREATE POLICY "Managers delete company announcements" ON public.announcements
  FOR DELETE TO authenticated
  USING (public.can_manage_announcements(auth.uid(), company_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
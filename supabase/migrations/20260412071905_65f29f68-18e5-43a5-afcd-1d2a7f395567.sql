
-- Fix infinite recursion: drop the problematic policy and recreate using security definer function
DROP POLICY IF EXISTS "Company admins manage their company access" ON public.user_company_access;

CREATE POLICY "Company admins manage their company access"
ON public.user_company_access
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_company_access uca
    WHERE uca.user_id = auth.uid()
      AND uca.company_id = user_company_access.company_id
      AND uca.role = 'admin'::app_role
  )
);

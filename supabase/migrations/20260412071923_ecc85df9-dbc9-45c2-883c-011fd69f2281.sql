
-- Create a security definer function to check company admin status without recursion
CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_access
    WHERE user_id = _user_id
      AND company_id = _company_id
      AND role = 'admin'::app_role
  )
$$;

-- Drop and recreate the policy using the new function
DROP POLICY IF EXISTS "Company admins manage their company access" ON public.user_company_access;

CREATE POLICY "Company admins manage their company access"
ON public.user_company_access
FOR ALL
TO authenticated
USING (
  public.is_company_admin(auth.uid(), company_id)
);

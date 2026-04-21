-- Remove the over-permissive policy
DROP POLICY IF EXISTS "Company members view contact-eligible employees" ON public.employees;

-- Drop the view (no longer needed)
DROP VIEW IF EXISTS public.company_contacts_view;

-- Create a SECURITY DEFINER function that returns only the safe contact columns
CREATE OR REPLACE FUNCTION public.get_company_contacts(_company_id uuid)
RETURNS TABLE(
  id uuid,
  full_name text,
  role text,
  department text,
  phone text,
  email text,
  contact_sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.full_name, e.role, e.department, e.phone, e.email, e.contact_sort_order
  FROM public.employees e
  WHERE e.company_id = _company_id
    AND e.status = 'active'::employee_status
    AND e.exclude_from_contacts = false
    AND (
      public.is_super_admin(auth.uid())
      OR _company_id IN (SELECT public.user_company_ids(auth.uid()))
    )
  ORDER BY e.contact_sort_order NULLS LAST, e.department, e.full_name
$$;

GRANT EXECUTE ON FUNCTION public.get_company_contacts(uuid) TO authenticated;

-- 1. Create employees_public view (excludes PII columns)
CREATE OR REPLACE VIEW public.employees_public
WITH (security_invoker = on)
AS
SELECT
  id, employee_code, full_name, role, department,
  direct_manager_id, status, start_date, end_date,
  linked_user_id, updated_at, company_id, created_at
FROM public.employees;

-- 2. Grant access on the view to authenticated users
GRANT SELECT ON public.employees_public TO authenticated;

-- 3. Update employees SELECT policy: restrict to admin/IT/super_admin only
DROP POLICY IF EXISTS "Users view company employees" ON public.employees;

CREATE POLICY "Admins and IT view company employees"
ON public.employees
FOR SELECT TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
);

-- Allow employees to read their own row (needed for portal, linked_user_id lookups)
CREATE POLICY "Employees view own record"
ON public.employees
FOR SELECT TO authenticated
USING (linked_user_id = auth.uid());

-- 4. Create get_company_birthdays function
CREATE OR REPLACE FUNCTION public.get_company_birthdays(_company_id uuid)
RETURNS TABLE(id uuid, full_name text, birth_date date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT e.id, e.full_name, e.birth_date
  FROM public.employees e
  WHERE e.company_id = _company_id
    AND e.status = 'active'
    AND e.birth_date IS NOT NULL
    AND EXTRACT(MONTH FROM e.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
  ORDER BY EXTRACT(DAY FROM e.birth_date)
$$;

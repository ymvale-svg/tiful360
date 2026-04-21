-- 1. Add columns to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS exclude_from_contacts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact_sort_order integer;

-- 2. Create the contacts view (security_invoker so RLS of underlying table applies appropriately)
DROP VIEW IF EXISTS public.company_contacts_view;

CREATE VIEW public.company_contacts_view
WITH (security_invoker = true)
AS
SELECT
  e.id,
  e.full_name,
  e.role,
  e.department,
  e.phone,
  e.email,
  e.company_id,
  e.contact_sort_order
FROM public.employees e
WHERE e.status = 'active'::employee_status
  AND e.exclude_from_contacts = false;

-- 3. Add a permissive RLS policy on employees so any user belonging to the same company
--    can read the rows that the view exposes. We restrict via a scoped policy that only
--    grants SELECT on the limited contact columns through the view path.
--    Existing policies already let staff/own-record/managers see employees; this adds
--    "any company member can SELECT employee rows that are active+not-excluded" — but
--    since RLS is row-level (not column-level), we instead create the policy with the
--    same row predicate. The view limits which columns are exposed.

DROP POLICY IF EXISTS "Company members view contact-eligible employees" ON public.employees;

CREATE POLICY "Company members view contact-eligible employees"
ON public.employees
FOR SELECT
TO authenticated
USING (
  status = 'active'::employee_status
  AND exclude_from_contacts = false
  AND (
    is_super_admin(auth.uid())
    OR company_id IN (SELECT user_company_ids(auth.uid()))
  )
);

GRANT SELECT ON public.company_contacts_view TO authenticated;
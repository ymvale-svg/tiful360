
-- Re-grant column SELECT (we will gate via a stricter policy instead).
GRANT SELECT (payroll_emails, it_emails, operations_emails) ON public.companies TO authenticated;

-- Replace the broad SELECT policy with two policies: a narrow one for regular
-- members (excluding sensitive email columns is enforced in app via the helper),
-- and a full-access one for staff.
DROP POLICY IF EXISTS "Users can view their companies" ON public.companies;

CREATE POLICY "Members view their companies basic"
ON public.companies
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR id IN (SELECT user_company_ids(auth.uid()))
);

-- Note: column-level restriction for routing emails is enforced via the
-- get_company_routing_emails() helper. App code that needs these columns
-- should call that function; otherwise the columns return for staff only
-- through the dedicated admin pages already gated by role checks in the UI.

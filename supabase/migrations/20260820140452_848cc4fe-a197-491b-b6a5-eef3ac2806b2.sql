-- Ensure no blanket table-level SELECT for client roles on companies
REVOKE SELECT ON public.companies FROM authenticated, anon;

-- Re-grant SELECT only on non-sensitive columns
GRANT SELECT (
  id, name, logo_url, created_by, created_at, updated_at,
  git_enabled, portal_name, portal_logo_url, portal_primary_color,
  attendance_corrections_auto_approve, domain_labels
) ON public.companies TO authenticated;

-- Explicitly remove any column-level read access to sensitive fields
REVOKE SELECT (
  payroll_emails, it_emails, operations_emails, expiry_notification_emails, hr_emails,
  git_custname, git_username, git_password_encrypted, git_base_url, git_default_site_code
) ON public.companies FROM authenticated, anon;

GRANT ALL ON public.companies TO service_role;
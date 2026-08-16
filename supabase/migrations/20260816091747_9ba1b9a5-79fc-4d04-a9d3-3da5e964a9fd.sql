REVOKE SELECT (git_custname, git_username, git_password_encrypted, git_base_url,
  payroll_emails, it_emails, operations_emails, expiry_notification_emails, hr_emails)
  ON public.companies FROM authenticated, anon;

REVOKE UPDATE (git_password_encrypted) ON public.companies FROM authenticated, anon;

REVOKE SELECT ON public.companies FROM anon;
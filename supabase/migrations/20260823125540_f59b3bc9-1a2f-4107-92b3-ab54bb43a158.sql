REVOKE SELECT ON public.companies FROM authenticated;
REVOKE SELECT ON public.companies FROM anon;
GRANT SELECT (
  id, name, logo_url, created_by, created_at, updated_at,
  portal_name, portal_logo_url, portal_primary_color,
  attendance_corrections_auto_approve, domain_labels
) ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
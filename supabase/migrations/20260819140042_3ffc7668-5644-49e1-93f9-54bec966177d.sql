GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Keep sensitive company columns hidden from regular users
REVOKE SELECT ON public.companies FROM authenticated;
GRANT SELECT (id, name, logo_url, created_by, created_at, updated_at,
  git_enabled, portal_name, portal_logo_url, portal_primary_color,
  attendance_corrections_auto_approve, domain_labels)
ON public.companies TO authenticated;
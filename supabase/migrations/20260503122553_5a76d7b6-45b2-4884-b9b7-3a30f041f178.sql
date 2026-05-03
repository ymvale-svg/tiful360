
CREATE OR REPLACE FUNCTION public.get_attendance_flow_stats(_company_id uuid)
RETURNS TABLE(
  last_punch_at timestamptz,
  count_5min bigint,
  count_hour bigint,
  count_today bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    MAX(created_at) AS last_punch_at,
    COUNT(*) FILTER (WHERE created_at >= now() - interval '5 minutes') AS count_5min,
    COUNT(*) FILTER (WHERE created_at >= now() - interval '1 hour') AS count_hour,
    COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now())) AS count_today
  FROM public.attendance_punches
  WHERE company_id = _company_id
    AND created_at >= date_trunc('day', now()) - interval '1 day'
    AND (
      public.is_super_admin(auth.uid())
      OR _company_id IN (SELECT public.user_company_ids(auth.uid()))
    );
$$;

CREATE INDEX IF NOT EXISTS idx_attendance_punches_company_created
  ON public.attendance_punches (company_id, created_at DESC);

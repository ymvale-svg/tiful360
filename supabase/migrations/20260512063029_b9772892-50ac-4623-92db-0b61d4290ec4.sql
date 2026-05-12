CREATE OR REPLACE FUNCTION public.noop_payslip_failure_tracking_marker()
RETURNS void
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULL::void;
$$;
CREATE OR REPLACE FUNCTION public.set_company_routing_emails(_company_id uuid, _column text, _emails text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_val text := NULLIF(_emails, '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _column IS NULL OR _column NOT IN ('payroll_emails','it_emails','operations_emails','expiry_notification_emails','hr_emails','secretariat_emails') THEN
    RAISE EXCEPTION 'Invalid column %', _column;
  END IF;
  IF NOT (
    public.is_super_admin(v_uid)
    OR (
      (public.has_role(v_uid,'admin'::app_role)
       OR public.is_payroll(v_uid)
       OR public.is_operations(v_uid)
       OR public.is_hr(v_uid)
       OR public.has_role(v_uid,'it_manager'::app_role))
      AND _company_id IN (SELECT public.user_company_ids(v_uid))
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.companies SET
    payroll_emails             = CASE WHEN _column = 'payroll_emails' THEN v_val ELSE payroll_emails END,
    it_emails                  = CASE WHEN _column = 'it_emails' THEN v_val ELSE it_emails END,
    operations_emails          = CASE WHEN _column = 'operations_emails' THEN v_val ELSE operations_emails END,
    expiry_notification_emails = CASE WHEN _column = 'expiry_notification_emails' THEN v_val ELSE expiry_notification_emails END,
    hr_emails                  = CASE WHEN _column = 'hr_emails' THEN v_val ELSE hr_emails END,
    secretariat_emails         = CASE WHEN _column = 'secretariat_emails' THEN v_val ELSE secretariat_emails END,
    updated_at = now()
  WHERE id = _company_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_company_routing_emails(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_company_routing_emails(uuid, text, text) TO authenticated, service_role;
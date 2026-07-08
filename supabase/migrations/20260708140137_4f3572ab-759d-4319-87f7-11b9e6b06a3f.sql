
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS hr_emails TEXT;

GRANT SELECT (hr_emails), UPDATE (hr_emails), INSERT (hr_emails) ON public.companies TO authenticated;

DROP FUNCTION IF EXISTS public.get_company_routing_emails(uuid);
CREATE FUNCTION public.get_company_routing_emails(_company_id uuid)
RETURNS TABLE(payroll_emails text, it_emails text, operations_emails text, expiry_notification_emails text, hr_emails text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.payroll_emails, c.it_emails, c.operations_emails, c.expiry_notification_emails, c.hr_emails
  FROM public.companies c
  WHERE c.id = _company_id
    AND (
      is_super_admin(auth.uid())
      OR (
        (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_operations(auth.uid()) OR has_role(auth.uid(), 'it_manager'::app_role))
        AND c.id IN (SELECT user_company_ids(auth.uid()))
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.set_company_routing_emails(
  _company_id uuid,
  _column text,
  _emails text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _column NOT IN ('payroll_emails','it_emails','operations_emails','expiry_notification_emails','hr_emails') THEN
    RAISE EXCEPTION 'Invalid column %', _column;
  END IF;
  IF NOT (
    public.is_super_admin(v_uid)
    OR (
      (public.has_role(v_uid,'admin'::app_role)
       OR public.is_payroll(v_uid)
       OR public.is_operations(v_uid)
       OR public.has_role(v_uid,'it_manager'::app_role))
      AND _company_id IN (SELECT public.user_company_ids(v_uid))
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  EXECUTE format('UPDATE public.companies SET %I = $1, updated_at = now() WHERE id = $2', _column)
    USING NULLIF(_emails, ''), _company_id;
END;
$$;

SELECT cron.unschedule(jobname) FROM cron.job
  WHERE jobname IN ('send-unmatched-weekly');

SELECT cron.schedule(
  'send-unmatched-weekly',
  '15 11 * * 4',
  $$
  SELECT net.http_post(
    url := 'https://rhzmhiknbcipucfvgkok.supabase.co/functions/v1/send-unmatched-weekly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

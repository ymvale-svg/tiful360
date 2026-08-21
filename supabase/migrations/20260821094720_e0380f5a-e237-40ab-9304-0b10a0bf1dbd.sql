ALTER TYPE public.leave_request_type ADD VALUE IF NOT EXISTS 'reserve';

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS secretariat_emails text;

CREATE OR REPLACE FUNCTION public.set_company_routing_emails(_company_id uuid, _column text, _emails text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF _column NOT IN ('payroll_emails','it_emails','operations_emails','expiry_notification_emails','hr_emails','secretariat_emails') THEN
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

  EXECUTE format('UPDATE public.companies SET %I = $1, updated_at = now() WHERE id = $2', _column)
    USING NULLIF(_emails, ''), _company_id;
END;
$fn$;

DROP FUNCTION IF EXISTS public.get_company_routing_emails(uuid);
CREATE OR REPLACE FUNCTION public.get_company_routing_emails(_company_id uuid)
RETURNS TABLE(payroll_emails text, it_emails text, operations_emails text, expiry_notification_emails text, hr_emails text, secretariat_emails text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT c.payroll_emails, c.it_emails, c.operations_emails, c.expiry_notification_emails, c.hr_emails, c.secretariat_emails
  FROM public.companies c
  WHERE c.id = _company_id
    AND (public.is_super_admin(auth.uid()) OR c.id IN (SELECT public.user_company_ids(auth.uid())));
$fn$;
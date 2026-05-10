
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS expiry_notification_emails text;

ALTER TABLE public.asset_categories
  ADD COLUMN IF NOT EXISTS default_notification_days_before integer;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS notification_days_before integer;

CREATE TABLE IF NOT EXISTS public.expiry_notifications_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  field_key text NOT NULL DEFAULT '__main__',
  expiry_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, field_key, expiry_date)
);

CREATE INDEX IF NOT EXISTS idx_expiry_notif_company ON public.expiry_notifications_sent(company_id);

ALTER TABLE public.expiry_notifications_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages expiry notifications" ON public.expiry_notifications_sent;
CREATE POLICY "Service role manages expiry notifications"
  ON public.expiry_notifications_sent
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Staff view company expiry notifications" ON public.expiry_notifications_sent;
CREATE POLICY "Staff view company expiry notifications"
  ON public.expiry_notifications_sent
  FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR (
      (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_operations(auth.uid()))
      AND company_id IN (SELECT public.user_company_ids(auth.uid()))
    )
  );

DROP FUNCTION IF EXISTS public.get_company_routing_emails(uuid);
CREATE FUNCTION public.get_company_routing_emails(_company_id uuid)
RETURNS TABLE(payroll_emails text, it_emails text, operations_emails text, expiry_notification_emails text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.payroll_emails, c.it_emails, c.operations_emails, c.expiry_notification_emails
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

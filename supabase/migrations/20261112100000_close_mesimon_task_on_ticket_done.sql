-- A ticket that was sent to Mesimon and is now closed here (from any screen or flow)
-- closes the Mesimon task made from it, through the close-mesimon-task function.
-- Same pg_net + vault service-role-key pattern as the scheduled functions.
CREATE OR REPLACE FUNCTION public.notify_mesimon_ticket_closed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://rhzmhiknbcipucfvgkok.supabase.co/functions/v1/close-mesimon-task',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := jsonb_build_object('ticket_id', NEW.id, 'closed_by', auth.uid())
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Closing the ticket never fails because Mesimon could not be told
  RAISE WARNING 'notify_mesimon_ticket_closed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS it_tickets_close_mesimon_task ON public.it_tickets;
CREATE TRIGGER it_tickets_close_mesimon_task
AFTER UPDATE OF status ON public.it_tickets
FOR EACH ROW
WHEN (NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' AND NEW.mesimon_task_id IS NOT NULL)
EXECUTE FUNCTION public.notify_mesimon_ticket_closed();

CREATE OR REPLACE FUNCTION public.auto_approve_sick_leave()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'pending'::leave_request_status THEN
    NEW.status := 'approved'::leave_request_status;
    NEW.reviewed_at := now();
    NEW.manager_notified_at := now();
  END IF;
  RETURN NEW;
END;
$function$;
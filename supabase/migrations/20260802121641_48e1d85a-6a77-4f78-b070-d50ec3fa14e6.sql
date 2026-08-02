CREATE OR REPLACE FUNCTION public.auto_approve_sick_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_manager boolean;
BEGIN
  IF NEW.status = 'pending'::leave_request_status THEN
    IF NEW.request_type = 'sick'::leave_request_type THEN
      NEW.status := 'approved'::leave_request_status;
      NEW.reviewed_at := now();
      NEW.manager_notified_at := now();
      RETURN NEW;
    END IF;

    SELECT (e.direct_manager_id IS NOT NULL)
      INTO _has_manager
    FROM public.employees e
    WHERE e.id = NEW.employee_id;

    IF COALESCE(_has_manager, false) = false AND NEW.manager_id IS NULL THEN
      NEW.status := 'approved'::leave_request_status;
      NEW.reviewed_at := now();
      NEW.manager_notified_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
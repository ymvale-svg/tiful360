ALTER TABLE public.offboarding_processes DROP CONSTRAINT IF EXISTS offboarding_processes_status_check;
ALTER TABLE public.offboarding_processes ADD CONSTRAINT offboarding_processes_status_check CHECK (status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'cancelled'::text]));

CREATE OR REPLACE FUNCTION public.cancel_offboarding(_employee_id uuid)
RETURNS employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _emp public.employees;
BEGIN
  SELECT * INTO _emp FROM public.employees WHERE id = _employee_id;
  IF _emp IS NULL THEN
    RAISE EXCEPTION 'employee not found';
  END IF;

  IF NOT (
    public.is_super_admin(auth.uid())
    OR public.is_company_admin(auth.uid(), _emp.company_id)
    OR public.is_hr(auth.uid())
  ) THEN
    RAISE EXCEPTION 'not authorized to cancel offboarding';
  END IF;

  UPDATE public.employees
     SET status = 'active',
         end_date = NULL,
         end_date_recorded_at = NULL,
         access_revoked_at = NULL,
         offboarding_snapshot = NULL,
         updated_at = now()
   WHERE id = _employee_id
   RETURNING * INTO _emp;

  UPDATE public.offboarding_processes
     SET status = 'cancelled', updated_at = now()
   WHERE employee_id = _employee_id AND status = 'in_progress';

  UPDATE public.offboarding_forms
     SET status = 'cancelled'
   WHERE employee_id = _employee_id AND status <> 'signed';

  UPDATE public.it_tickets
     SET status = 'done', resolved_at = now(), resolved_by = auth.uid(), updated_at = now()
   WHERE employee_id = _employee_id AND ticket_type = 'offboarding' AND status <> 'done';

  UPDATE public.alerts
     SET is_resolved = true, resolved_at = now()
   WHERE related_employee_id = _employee_id AND is_resolved = false
     AND title ILIKE '%עזיבה%';

  INSERT INTO public.activity_log (employee_id, company_id, action, details, entity_type, entity_id, performed_by)
  VALUES (_employee_id, _emp.company_id, 'ביטול תהליך עזיבה - ' || _emp.full_name,
          'סטטוס העובד הוחזר לפעיל ופרוטוקול העזיבה בוטל.', 'employee', _employee_id, auth.uid());

  RETURN _emp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_offboarding(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_edit_punch_time(_punch_id uuid, _new_punch_at timestamp with time zone)
 RETURNS attendance_punches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.attendance_punches;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_row FROM public.attendance_punches WHERE id = _punch_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Punch not found'; END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR (
      (public.has_role(v_uid, 'admin'::app_role)
        OR public.is_payroll(v_uid) OR public.is_hr(v_uid)
        OR public.is_operations(v_uid))
      AND v_row.company_id IN (SELECT public.user_company_ids(v_uid))
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_punches
  SET punch_at = _new_punch_at,
      status = 'approved',
      edited_at = now(),
      edited_by = v_uid,
      raw_payload = COALESCE(raw_payload, '{}'::jsonb) ||
        jsonb_build_object('manual_edit', jsonb_build_object(
          'previous_punch_at', v_row.punch_at,
          'edited_at', now(),
          'edited_by', v_uid,
          'edited_by_role', 'admin'
        ))
  WHERE id = _punch_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;
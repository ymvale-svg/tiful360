-- 1. Direct assignment of system access by the company admin: access employees already hold is
--    recorded as active at once, without a request ticket, dispatch or approval. Used for the
--    one-time initial entry of a company's access (from the matrix screen or an Excel file filled
--    from the matrix template). Each call writes one completed request per employee; every grant is
--    also logged by the existing audit_system_access_grants trigger, and one summary row is added.
-- 2. Bulk deletion of onboarding processes by the company admin, in one transaction: open
--    onboarding tickets are closed, employees left in "onboarding" with no other process become
--    active, and one audit row per company records who deleted what.

CREATE OR REPLACE FUNCTION public.assign_system_access_direct(_company_id uuid, _rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _actor_name text;
  _row jsonb;
  _emp public.employees;
  _system public.system_access_systems;
  _group_id uuid;
  _resource_id uuid;
  _from timestamptz;
  _request_id uuid;
  _requests jsonb := '{}'::jsonb;
  _grants int := 0;
  _skipped int := 0;
BEGIN
  IF _actor IS NULL OR public.my_access_blocked() OR NOT public.system_access_is_manager(_company_id) THEN
    RAISE EXCEPTION 'not authorized to assign access for this company';
  END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 THEN
    RAISE EXCEPTION 'nothing to assign';
  END IF;
  IF jsonb_array_length(_rows) > 5000 THEN
    RAISE EXCEPTION 'too many rows (max 5000)';
  END IF;
  _actor_name := public.system_access_actor_name(_actor);

  FOR _row IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    SELECT * INTO _emp FROM public.employees
     WHERE id = NULLIF(_row->>'employee_id', '')::uuid AND company_id = _company_id;
    IF _emp.id IS NULL THEN
      RAISE EXCEPTION 'employee not found in this company';
    END IF;
    SELECT * INTO _system FROM public.system_access_systems
     WHERE id = NULLIF(_row->>'system_id', '')::uuid AND company_id = _company_id;
    IF _system.id IS NULL THEN
      RAISE EXCEPTION 'system not found in this company';
    END IF;
    _group_id := NULLIF(_row->>'group_id', '')::uuid;
    _resource_id := NULLIF(_row->>'resource_id', '')::uuid;
    IF _group_id IS NOT NULL AND _resource_id IS NOT NULL THEN
      RAISE EXCEPTION 'choose a group or a resource, not both';
    END IF;
    IF _group_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.system_access_groups WHERE id = _group_id AND system_id = _system.id) THEN
      RAISE EXCEPTION 'access group not found in %', _system.name;
    END IF;
    IF _resource_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.system_access_resources WHERE id = _resource_id AND system_id = _system.id) THEN
      RAISE EXCEPTION 'resource not found in %', _system.name;
    END IF;

    -- Access held or already on its way is not entered twice.
    IF EXISTS (
      SELECT 1 FROM public.system_access_grants g
       WHERE g.employee_id = _emp.id AND g.system_id = _system.id
         AND g.group_id IS NOT DISTINCT FROM _group_id AND g.resource_id IS NOT DISTINCT FROM _resource_id
         AND g.status IN ('requested', 'dispatched', 'active', 'revoke_requested', 'revoke_dispatched')
    ) THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    -- From the given time, else the given day at 08:00 Israel time, else the employee's first day
    -- at 08:00, else now.
    _from := COALESCE(
      NULLIF(_row->>'effective_from', '')::timestamptz,
      (NULLIF(_row->>'effective_date', '')::date + time '08:00') AT TIME ZONE 'Asia/Jerusalem',
      (_emp.start_date + time '08:00') AT TIME ZONE 'Asia/Jerusalem',
      date_trunc('minute', now()));

    _request_id := NULLIF(_requests->>(_emp.id::text), '')::uuid;
    IF _request_id IS NULL THEN
      INSERT INTO public.system_access_requests (company_id, employee_id, kind, status, requested_by, requested_by_name, note, completed_at)
      VALUES (_company_id, _emp.id, 'grant', 'done', _actor, _actor_name, 'הזנה ישירה של הרשאות קיימות', now())
      RETURNING id INTO _request_id;
      _requests := _requests || jsonb_build_object(_emp.id::text, _request_id);
    END IF;

    INSERT INTO public.system_access_grants (
      company_id, request_id, employee_id, system_id, group_id, resource_id, status, effective_from,
      executed_at, executed_by, executed_by_name, external_username, note)
    VALUES (
      _company_id, _request_id, _emp.id, _system.id, _group_id, _resource_id, 'active', _from,
      now(), _actor, _actor_name, NULLIF(btrim(COALESCE(_row->>'external_username', '')), ''),
      'הוזן ישירות על ידי מנהל המערכת');
    _grants := _grants + 1;
  END LOOP;

  IF _grants > 0 THEN
    INSERT INTO public.permission_audit_log (actor_user_id, company_id, action, details)
    VALUES (_actor, _company_id, 'system_access_direct_assign',
            'הזנה ישירה של הרשאות: ' || _grants || ' הרשאות ל-' || (SELECT count(*) FROM jsonb_object_keys(_requests))
            || ' עובדים, ' || _skipped || ' כבר קיימות');
  END IF;

  RETURN jsonb_build_object('grants', _grants, 'employees', (SELECT count(*) FROM jsonb_object_keys(_requests)), 'skipped', _skipped);
END;
$$;
REVOKE ALL ON FUNCTION public.assign_system_access_direct(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_system_access_direct(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_onboarding_processes(_company_id uuid, _process_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _ids uuid[];
  _employees uuid[];
  _names text;
  _deleted int;
  _tickets int;
  _activated int;
BEGIN
  IF _actor IS NULL OR public.my_access_blocked() OR NOT (
    public.is_super_admin(_actor)
    OR (public.has_role(_actor, 'admin'::app_role) AND _company_id IN (SELECT public.user_company_ids(_actor)))
  ) THEN
    RAISE EXCEPTION 'not authorized to delete onboarding processes for this company';
  END IF;

  SELECT array_agg(p.id), array_agg(DISTINCT p.employee_id),
         string_agg(DISTINCT e.full_name, ', ')
    INTO _ids, _employees, _names
    FROM public.onboarding_processes p
    LEFT JOIN public.employees e ON e.id = p.employee_id
   WHERE p.company_id = _company_id AND p.id = ANY (COALESCE(_process_ids, '{}'));
  IF _ids IS NULL THEN
    RAISE EXCEPTION 'no onboarding processes found';
  END IF;

  -- The onboarding ticket of a deleted process is closed rather than left open with nothing behind it.
  UPDATE public.it_tickets t
     SET status = 'done', resolved_at = COALESCE(t.resolved_at, now())
   WHERE t.company_id = _company_id AND t.status <> 'done'
     AND t.id IN (SELECT it_ticket_id FROM public.onboarding_processes WHERE id = ANY (_ids) AND it_ticket_id IS NOT NULL);
  GET DIAGNOSTICS _tickets = ROW_COUNT;

  DELETE FROM public.onboarding_processes WHERE id = ANY (_ids);
  GET DIAGNOSTICS _deleted = ROW_COUNT;

  -- Employees no longer being onboarded are active.
  UPDATE public.employees e
     SET status = 'active', updated_at = now()
   WHERE e.id = ANY (_employees) AND e.company_id = _company_id AND e.status = 'onboarding'
     AND NOT EXISTS (SELECT 1 FROM public.onboarding_processes p WHERE p.employee_id = e.id AND p.status <> 'done');
  GET DIAGNOSTICS _activated = ROW_COUNT;

  INSERT INTO public.permission_audit_log (actor_user_id, company_id, action, details)
  VALUES (_actor, _company_id, 'onboarding_processes_deleted',
          'מחיקת ' || _deleted || ' תהליכי קליטה: ' || left(COALESCE(_names, ''), 1500));

  RETURN jsonb_build_object('deleted', _deleted, 'ticketsClosed', _tickets, 'employeesActivated', _activated);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_onboarding_processes(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_onboarding_processes(uuid, uuid[]) TO authenticated;

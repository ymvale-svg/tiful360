-- 1. A system access request for an employee who is being onboarded is linked to that onboarding,
--    also when it is made from the system access screen rather than the onboarding form, so it
--    shows in the onboarding checklist and holds the onboarding's completion.
-- 2. A one-time import of access granted before the system access screen existed: digital-access
--    assets assigned to employees (category = system, sub-category = environment) and active rows of
--    the legacy digital_access table (access type = system, path = environment) become active grants,
--    under one completed request per employee. Missing systems and environments are created. A
--    preview runs the same code and rolls it back, so it shows exactly what an import would do.

CREATE OR REPLACE FUNCTION public.request_system_access(
  _employee_id uuid,
  _items jsonb,
  _onboarding_process_id uuid DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _emp public.employees;
  _req public.system_access_requests;
  _item jsonb;
  _system public.system_access_systems;
  _group_id uuid;
  _resource_id uuid;
  _default_from timestamptz;
  _from timestamptz;
  _created int := 0;
  _skipped int := 0;
  _code text;
  _ticket uuid;
BEGIN
  IF _actor IS NULL OR public.my_access_blocked() THEN
    RAISE EXCEPTION 'not authorized to request access';
  END IF;
  SELECT * INTO _emp FROM public.employees WHERE id = _employee_id;
  IF _emp.id IS NULL OR _emp.company_id IS NULL THEN
    RAISE EXCEPTION 'employee not found';
  END IF;
  IF NOT (public.is_super_admin(_actor) OR (
    _emp.company_id IN (SELECT public.user_company_ids(_actor))
    AND (public.has_role(_actor, 'admin') OR public.has_role(_actor, 'hr')
         OR public.is_operations(_actor) OR public.has_role(_actor, 'it_manager'))
  )) THEN
    RAISE EXCEPTION 'not authorized to request access for this employee';
  END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'choose at least one system';
  END IF;
  -- A request made outside the form for someone still being onboarded belongs to that onboarding:
  -- it shows in its checklist and holds its completion. Drafts are left alone, since sending a
  -- draft makes its own request from the access picked in the form.
  IF _onboarding_process_id IS NULL THEN
    SELECT p.id INTO _onboarding_process_id FROM public.onboarding_processes p
     WHERE p.employee_id = _emp.id AND p.company_id = _emp.company_id AND p.status IN ('sent', 'in_progress')
     ORDER BY p.created_at DESC LIMIT 1;
  END IF;
  IF _onboarding_process_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.onboarding_processes
    WHERE id = _onboarding_process_id AND employee_id = _emp.id AND company_id = _emp.company_id
  ) THEN
    RAISE EXCEPTION 'onboarding process does not belong to this employee';
  END IF;

  -- Default start: the first working day at 08:00 Israel time, or now when it has passed.
  _default_from := GREATEST(
    COALESCE((_emp.start_date + time '08:00') AT TIME ZONE 'Asia/Jerusalem', now()),
    date_trunc('minute', now()));

  INSERT INTO public.system_access_requests (company_id, employee_id, requested_by, requested_by_name, note, onboarding_process_id)
  VALUES (_emp.company_id, _emp.id, _actor, public.system_access_actor_name(_actor), NULLIF(btrim(COALESCE(_note, '')), ''), _onboarding_process_id)
  RETURNING * INTO _req;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO _system FROM public.system_access_systems
     WHERE id = NULLIF(_item->>'system_id', '')::uuid AND company_id = _emp.company_id AND is_active;
    IF _system.id IS NULL THEN
      RAISE EXCEPTION 'system not found or inactive';
    END IF;
    _group_id := NULLIF(_item->>'group_id', '')::uuid;
    _resource_id := NULLIF(_item->>'resource_id', '')::uuid;
    IF _group_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.system_access_groups WHERE id = _group_id AND system_id = _system.id AND is_active) THEN
      RAISE EXCEPTION 'access group not found in %', _system.name;
    END IF;
    IF _resource_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.system_access_resources WHERE id = _resource_id AND system_id = _system.id AND is_active) THEN
      RAISE EXCEPTION 'resource not found in %', _system.name;
    END IF;
    _from := COALESCE(NULLIF(_item->>'effective_from', '')::timestamptz, _default_from);

    -- Access the employee already has, or already asked for, is not requested twice.
    IF EXISTS (
      SELECT 1 FROM public.system_access_grants g
      WHERE g.employee_id = _emp.id AND g.system_id = _system.id
        AND g.group_id IS NOT DISTINCT FROM _group_id AND g.resource_id IS NOT DISTINCT FROM _resource_id
        AND g.status IN ('requested', 'dispatched', 'active', 'revoke_requested', 'revoke_dispatched')
    ) THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.system_access_grants (company_id, request_id, employee_id, system_id, group_id, resource_id, effective_from)
    VALUES (_emp.company_id, _req.id, _emp.id, _system.id, _group_id, _resource_id, _from);
    _created := _created + 1;
  END LOOP;

  IF _created = 0 THEN
    RAISE EXCEPTION 'the employee already has or has requested all of this access';
  END IF;

  _code := 'ACC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  INSERT INTO public.it_tickets (ticket_code, company_id, title, description, employee_id, ticket_type, subject_category, priority, status, sla_deadline)
  VALUES (
    _code, _emp.company_id,
    'בקשת הרשאות – ' || _emp.full_name,
    'בקשת הרשאות למערכות לעובד/ת ' || _emp.full_name
      || COALESCE(' (' || _emp.employee_code || ')', '') || '. ביקש/ה: ' || _req.requested_by_name
      || COALESCE('. הערה: ' || _req.note, '') || '. הטיפול במסך הרשאות מערכות.',
    _emp.id, 'access', 'access', 'medium', 'open', _default_from)
  RETURNING id INTO _ticket;
  UPDATE public.system_access_requests SET hub_ticket_id = _ticket WHERE id = _req.id;
  PERFORM public.sync_system_access_tickets(_req.id);

  RETURN jsonb_build_object('requestId', _req.id, 'ticketId', _ticket, 'ticketCode', _code,
                            'created', _created, 'skipped', _skipped, 'onboardingProcessId', _onboarding_process_id);
END;
$$;
REVOKE ALL ON FUNCTION public.request_system_access(uuid, jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_system_access(uuid, jsonb, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_legacy_system_access(_company_id uuid, _apply boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _actor_name text;
  _row record;
  _system_id uuid;
  _resource_id uuid;
  _request_id uuid;
  _requests jsonb := '{}'::jsonb;
  _summary jsonb := '{}'::jsonb;
  _systems_created int := 0;
  _resources_created int := 0;
  _grants int := 0;
  _skipped int := 0;
  _result jsonb;
BEGIN
  IF _actor IS NULL OR NOT public.system_access_can_manage(_company_id) THEN
    RAISE EXCEPTION 'not authorized to import access for this company';
  END IF;
  _actor_name := public.system_access_actor_name(_actor);

  BEGIN
    FOR _row IN
      -- Digital-access assets held by employees: the category is the system, the sub-category the environment.
      SELECT a.current_owner_id AS employee_id, btrim(c.category_name) AS system_name, NULLIF(btrim(g.name), '') AS resource_name,
             NULLIF(btrim(a.account_username), '') AS username, 'asset' AS source, a.id AS source_id, a.created_at AS created_at,
             e.start_date
        FROM public.assets a
        JOIN public.asset_categories c ON c.id = a.category_id
        JOIN public.employees e ON e.id = a.current_owner_id AND e.company_id = _company_id
        LEFT JOIN public.asset_groups g ON g.id = a.group_id
       WHERE a.company_id = _company_id
         AND (c.domain = 'digital' OR c.prefix IN ('VRT', 'DACC') OR c.protocol_type::text = 'digital')
         AND e.status <> 'inactive'
      UNION ALL
      -- The older per-employee access list.
      SELECT d.employee_id, btrim(d.access_type), NULLIF(btrim(d.resource_path), ''), NULL, 'digital_access', d.id, d.created_at,
             e.start_date
        FROM public.digital_access d
        JOIN public.employees e ON e.id = d.employee_id AND e.company_id = _company_id
       WHERE d.status = 'active' AND e.status <> 'inactive' AND btrim(d.access_type) <> ''
      ORDER BY 2, 3 NULLS FIRST, 1
    LOOP
      SELECT id INTO _system_id FROM public.system_access_systems
       WHERE company_id = _company_id AND lower(btrim(name)) = lower(_row.system_name);
      IF _system_id IS NULL THEN
        INSERT INTO public.system_access_systems (company_id, name) VALUES (_company_id, left(_row.system_name, 80))
        RETURNING id INTO _system_id;
        _systems_created := _systems_created + 1;
      END IF;

      _resource_id := NULL;
      IF _row.resource_name IS NOT NULL THEN
        SELECT id INTO _resource_id FROM public.system_access_resources
         WHERE system_id = _system_id AND lower(path) = lower(replace(_row.resource_name, '/', '\'));
        IF _resource_id IS NULL THEN
          INSERT INTO public.system_access_resources (system_id, company_id, name, path)
          VALUES (_system_id, _company_id, left(_row.resource_name, 200), left(replace(_row.resource_name, '/', '\'), 1000))
          RETURNING id INTO _resource_id;
          _resources_created := _resources_created + 1;
        END IF;
      END IF;

      -- Access the employee already holds (or has asked for) is not imported twice.
      IF EXISTS (
        SELECT 1 FROM public.system_access_grants
         WHERE employee_id = _row.employee_id AND system_id = _system_id AND group_id IS NULL
           AND resource_id IS NOT DISTINCT FROM _resource_id
           AND status IN ('requested', 'dispatched', 'active', 'revoke_requested', 'revoke_dispatched')
      ) THEN
        _skipped := _skipped + 1;
        CONTINUE;
      END IF;

      _request_id := NULLIF(_requests->>(_row.employee_id::text), '')::uuid;
      IF _request_id IS NULL THEN
        INSERT INTO public.system_access_requests (company_id, employee_id, kind, status, requested_by, requested_by_name, note, completed_at)
        VALUES (_company_id, _row.employee_id, 'grant', 'done', _actor, _actor_name, 'ייבוא הרשאות קיימות מהמשאבים', now())
        RETURNING id INTO _request_id;
        _requests := _requests || jsonb_build_object(_row.employee_id::text, _request_id);
      END IF;

      INSERT INTO public.system_access_grants (
        company_id, request_id, employee_id, system_id, resource_id, status, effective_from,
        executed_at, executed_by_name, external_username, note)
      VALUES (
        _company_id, _request_id, _row.employee_id, _system_id, _resource_id, 'active',
        COALESCE((_row.start_date + time '08:00') AT TIME ZONE 'Asia/Jerusalem', _row.created_at),
        -- When it really opened is not known: the protocol shows "—" rather than a guess.
        NULL, NULL, _row.username,
        CASE _row.source WHEN 'asset' THEN 'יובא מהמשאבים (גישות דיגיטליות)' ELSE 'יובא מרשימת הגישות הקודמת' END);
      _grants := _grants + 1;

      _summary := jsonb_set(_summary, ARRAY[_row.system_name],
        jsonb_build_object('grants', COALESCE((_summary->_row.system_name->>'grants')::int, 0) + 1), true);
    END LOOP;

    _result := jsonb_build_object(
      'applied', _apply, 'systemsCreated', _systems_created, 'resourcesCreated', _resources_created,
      'grants', _grants, 'employees', (SELECT count(*) FROM jsonb_object_keys(_requests)), 'skipped', _skipped,
      'bySystem', _summary);

    IF NOT _apply THEN
      -- A preview: undo everything above, keep the counts.
      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'preview';
    END IF;

    INSERT INTO public.permission_audit_log (actor_user_id, company_id, action, details)
    VALUES (_actor, _company_id, 'system_access_legacy_import',
            'ייבוא הרשאות קיימות: ' || _grants || ' הרשאות ל-' || (_result->>'employees') || ' עובדים, '
            || _systems_created || ' מערכות ו-' || _resources_created || ' סביבות חדשות, ' || _skipped || ' כבר קיימות');
  EXCEPTION WHEN SQLSTATE 'P0099' THEN
    NULL;
  END;
  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.import_legacy_system_access(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_legacy_system_access(uuid, boolean) TO authenticated;
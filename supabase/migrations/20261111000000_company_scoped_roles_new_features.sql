-- Security: the new features check the caller's role IN THE COMPANY of the record, not the global role union.
--
-- user_roles (has_role / is_hr / is_payroll / is_operations) is the union of the roles a user holds in
-- every company. The location report, system access, vehicle leasing and onboarding checklist (all from
-- 10.11) combined that global role with "has any access to the company". So an admin/HR/payroll/IT/
-- operations user of company A who is only a plain user in company B could, in company B:
--   * read GPS points and street addresses of every remote punch (attendance location report);
--   * rewrite the system-access catalog, read grants, dispatch/reject/mark grants and open requests;
--   * manage suppliers, leasing requests and quotes;
--   * tick onboarding items (which reassigns assets).
-- The role now comes from the caller's permission-group memberships in that company, the same rule as
-- can_manage_group_members (20261109000000) and cancel_offboarding (20261110010000). Since
-- 20261104090000_permission_groups every role is granted through the company's groups, so users keep
-- the same access in their own company. super_admin and company admins (is_company_admin) are unchanged.
-- Signatures, SECURITY DEFINER, search_path and grants are unchanged.
-- Also: three SECURITY DEFINER helpers that are only called from other definer functions lose the
-- default PUBLIC/anon/authenticated EXECUTE.
--
-- Findings: appsec:location-report-global-role-union, appsec:system-access-catalog-global-role-union,
-- appsec:system-access-requests-global-role-union, appsec:fleet-global-role-union,
-- appsec:complete-onboarding-item-global-role-union, appsec:definer-helpers-default-execute-anon

-- Does _uid hold one of _roles in _company_id? super_admin always; a company admin counts as 'admin'.
CREATE OR REPLACE FUNCTION public.has_role_in_company(_uid uuid, _company_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND _company_id IS NOT NULL AND (
    public.is_super_admin(_uid)
    OR (_company_id IN (SELECT public.user_company_ids(_uid))
        AND (('admin'::public.app_role = ANY (_roles) AND public.is_company_admin(_uid, _company_id))
             OR EXISTS (SELECT 1
                        FROM public.permission_group_members m
                        JOIN public.permission_groups g ON g.id = m.group_id
                        WHERE m.user_id = _uid
                          AND g.company_id = _company_id
                          AND g.roles && _roles)))
  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_role_in_company(uuid, uuid, public.app_role[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_in_company(uuid, uuid, public.app_role[]) TO service_role;

-- System access catalog (was 20261110220000).
CREATE OR REPLACE FUNCTION public.system_access_can_view(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role_in_company(auth.uid(), _company_id,
    ARRAY['admin', 'it_manager', 'operations', 'hr']::public.app_role[]);
$$;

CREATE OR REPLACE FUNCTION public.system_access_can_manage(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role_in_company(auth.uid(), _company_id, ARRAY['admin', 'it_manager']::public.app_role[]);
$$;

-- System access requests (was 20261110230000).
CREATE OR REPLACE FUNCTION public.system_access_is_manager(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role_in_company(auth.uid(), _company_id, ARRAY['admin']::public.app_role[]);
$$;

CREATE OR REPLACE FUNCTION public.system_access_is_owner(_system_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.system_access_systems s
    WHERE s.id = _system_id
      AND s.company_id IN (SELECT public.user_company_ids(auth.uid()))
      AND (s.owner_user_id = auth.uid()
           OR (s.owner_user_id IS NULL AND s.owner_role IS NOT NULL
               AND public.has_role_in_company(auth.uid(), s.company_id, ARRAY[s.owner_role]::public.app_role[])))
  );
$$;

-- Vehicle leasing (was 20261110250000).
CREATE OR REPLACE FUNCTION public.fleet_can_view(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role_in_company(auth.uid(), _company_id,
    ARRAY['admin', 'operations', 'finance', 'hr']::public.app_role[]);
$$;

CREATE OR REPLACE FUNCTION public.fleet_can_manage(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role_in_company(auth.uid(), _company_id,
    ARRAY['admin', 'operations', 'finance']::public.app_role[]);
$$;

-- Attendance location report: who sees every employee of the company.
CREATE OR REPLACE FUNCTION public.attendance_report_visible_employee_ids(_company_id uuid)
RETURNS TABLE(employee_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  IF NOT (public.is_super_admin(v_uid) OR _company_id IN (SELECT public.user_company_ids(v_uid))) THEN
    RETURN;
  END IF;

  IF public.is_super_admin(v_uid)
     OR public.has_role_in_company(v_uid, _company_id, ARRAY['admin', 'payroll', 'hr']::public.app_role[]) THEN
    RETURN QUERY SELECT e.id FROM public.employees e WHERE e.company_id = _company_id;
  ELSE
    RETURN QUERY
      SELECT e.id FROM public.employees e
      WHERE e.company_id = _company_id
        AND e.id IN (SELECT s.employee_id FROM public.get_subordinate_employee_ids(v_uid) s);
  END IF;
END;
$function$;

-- Requesting access for an employee (latest body: 20261110300000).
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
    public.has_role_in_company(_actor, _emp.company_id,
      ARRAY['admin', 'hr', 'operations', 'it_manager']::public.app_role[])
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

-- Requesting revocation for an employee (latest body: 20261110240000).
CREATE OR REPLACE FUNCTION public.request_system_access_revocation(
  _employee_id uuid,
  _grant_ids uuid[] DEFAULT NULL,
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
  _result jsonb;
BEGIN
  IF _actor IS NULL OR public.my_access_blocked() THEN
    RAISE EXCEPTION 'not authorized to revoke access';
  END IF;
  SELECT * INTO _emp FROM public.employees WHERE id = _employee_id;
  IF _emp.id IS NULL OR _emp.company_id IS NULL THEN
    RAISE EXCEPTION 'employee not found';
  END IF;
  IF NOT (public.is_super_admin(_actor) OR (
    public.has_role_in_company(_actor, _emp.company_id,
      ARRAY['admin', 'hr', 'operations', 'it_manager']::public.app_role[])
  )) THEN
    RAISE EXCEPTION 'not authorized to revoke access for this employee';
  END IF;
  _result := public.create_system_access_revocation(_emp, _actor, _grant_ids, date_trunc('minute', now()), _note);
  IF (_result->>'count')::int = 0 THEN
    RAISE EXCEPTION 'no active access to revoke';
  END IF;
  RETURN _result;
END;
$$;

-- Ticking an onboarding item (latest body: 20261110200000).
CREATE OR REPLACE FUNCTION public.complete_onboarding_item(_item_id uuid, _done boolean, _note text DEFAULT NULL)
RETURNS public.onboarding_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item public.onboarding_items;
  _proc public.onboarding_processes;
  _asset public.assets;
  _uid uuid := auth.uid();
BEGIN
  SELECT * INTO _item FROM public.onboarding_items WHERE id = _item_id FOR UPDATE;
  IF _item.id IS NULL THEN
    RAISE EXCEPTION 'onboarding item not found';
  END IF;
  SELECT * INTO _proc FROM public.onboarding_processes WHERE id = _item.process_id FOR UPDATE;

  IF NOT (
    _uid IS NOT NULL AND _proc.company_id IS NOT NULL
    AND (public.is_super_admin(_uid)
         OR public.has_role_in_company(_uid, _proc.company_id,
              ARRAY['admin', 'it_manager', 'operations', 'hr']::public.app_role[]))
  ) THEN
    RAISE EXCEPTION 'not authorized to update this onboarding item';
  END IF;

  IF _done THEN
    IF _item.status = 'done' THEN
      RETURN _item;
    END IF;

    IF _item.asset_id IS NULL AND public.onboarding_item_needs_asset(_item.item_type) THEN
      RAISE EXCEPTION 'asset required: pick or create the item before marking it done';
    END IF;

    IF _item.asset_id IS NOT NULL THEN
      SELECT * INTO _asset FROM public.assets WHERE id = _item.asset_id FOR UPDATE;
      IF _asset.id IS NULL OR _asset.company_id IS DISTINCT FROM _proc.company_id THEN
        RAISE EXCEPTION 'asset not found in this company';
      END IF;
      IF _asset.current_owner_id IS NOT NULL AND _asset.current_owner_id <> _proc.employee_id THEN
        RAISE EXCEPTION 'asset is assigned to another employee';
      END IF;
      IF _asset.current_owner_id IS NULL AND _asset.status <> 'in_stock' THEN
        RAISE EXCEPTION 'asset is not in stock';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.onboarding_items o
        WHERE o.asset_id = _asset.id AND o.id <> _item.id AND o.status = 'done'
      ) AND _asset.current_owner_id IS DISTINCT FROM _proc.employee_id THEN
        RAISE EXCEPTION 'asset already handed over in another onboarding item';
      END IF;

      UPDATE public.onboarding_items SET asset_prior_owner_id = _asset.current_owner_id WHERE id = _item.id;
      UPDATE public.assets
         SET current_owner_id = _proc.employee_id, status = 'in_use'
       WHERE id = _asset.id;

      INSERT INTO public.activity_log(employee_id, company_id, action, details, entity_type, entity_id, performed_by)
      VALUES (_proc.employee_id, _proc.company_id,
              'הצמדת פריט בקליטת עובד: ' || COALESCE(_asset.asset_name, _item.title),
              CASE WHEN _asset.asset_code IS NOT NULL THEN 'מזהה פריט: ' || _asset.asset_code END,
              'asset', _asset.id, _uid);
    END IF;

    UPDATE public.onboarding_items
       SET status = 'done',
           assigned_at = CASE WHEN asset_id IS NOT NULL THEN now() ELSE assigned_at END,
           completed_at = now(),
           completed_by = _uid,
           completion_note = NULLIF(btrim(COALESCE(_note, '')), '')
     WHERE id = _item.id
     RETURNING * INTO _item;

    IF _proc.status = 'sent' THEN
      UPDATE public.onboarding_processes SET status = 'in_progress' WHERE id = _proc.id;
    END IF;
  ELSE
    IF _item.status <> 'done' THEN
      RETURN _item;
    END IF;

    IF _item.asset_id IS NOT NULL THEN
      SELECT * INTO _asset FROM public.assets WHERE id = _item.asset_id FOR UPDATE;
      -- Return the asset only if onboarding gave it and the employee still holds it.
      IF _asset.id IS NOT NULL
         AND _asset.current_owner_id = _proc.employee_id
         AND _item.asset_prior_owner_id IS DISTINCT FROM _proc.employee_id THEN
        UPDATE public.assets
           SET current_owner_id = _item.asset_prior_owner_id,
               status = CASE WHEN _item.asset_prior_owner_id IS NULL THEN 'in_stock'::asset_status ELSE status END
         WHERE id = _asset.id;

        INSERT INTO public.activity_log(employee_id, company_id, action, details, entity_type, entity_id, performed_by)
        VALUES (NULL, _proc.company_id,
                'ביטול הצמדה בקליטת עובד: ' || COALESCE(_asset.asset_name, _item.title),
                CASE WHEN _asset.asset_code IS NOT NULL THEN 'מזהה פריט: ' || _asset.asset_code END,
                'asset', _asset.id, _uid);
      END IF;
    END IF;

    UPDATE public.onboarding_items
       SET status = 'pending', assigned_at = NULL, completed_at = NULL, completed_by = NULL,
           completion_note = NULL, asset_prior_owner_id = NULL
     WHERE id = _item.id
     RETURNING * INTO _item;
  END IF;

  RETURN _item;
END;
$$;

-- Definer helpers used only inside other definer functions: no direct EXECUTE.
REVOKE EXECUTE ON FUNCTION public.system_access_actor_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.system_access_grant_label(public.system_access_grants) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.system_access_request_grants(public.system_access_requests) FROM PUBLIC, anon, authenticated;

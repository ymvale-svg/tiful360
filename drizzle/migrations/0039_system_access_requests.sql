-- System access requests: the chain from "HR asked" to "access is open".
--
-- 1. request_system_access   HR (or an admin) asks for access for an employee. One request,
--                            one grant row per system × resource/group, and a hub ticket for
--                            the access manager listing every grant as a checklist line.
-- 2. dispatch_system_access  The manager sends grants to their owners: one ticket per owner
--                            (e.g. IT for drive P), its checklist one line per grant.
-- 3. resolve_system_access_grant
--                            The manager or the owner marks a grant done (with the real time
--                            and the external user name), rejects it, or the owner returns it.
-- 4. Ticking a grant's line in the owner's ticket, or closing that ticket, marks the grant done
--    (trigger on it_tickets), so the result reaches the manager from the ticket screen too.
--
-- Every change keeps the hub and owner tickets in step: their checklists mirror the grants and
-- a ticket closes when all its grants are done or rejected. Grants are written only by these
-- functions; their history is in permission_audit_log with the actor.

CREATE TABLE IF NOT EXISTS public.system_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'grant' CHECK (kind IN ('grant', 'revoke')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  requested_by uuid NOT NULL,
  requested_by_name text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  note text,
  onboarding_process_id uuid REFERENCES public.onboarding_processes(id) ON DELETE SET NULL,
  hub_ticket_id uuid REFERENCES public.it_tickets(id) ON DELETE SET NULL,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS system_access_requests_employee_idx ON public.system_access_requests(employee_id);
CREATE INDEX IF NOT EXISTS system_access_requests_onboarding_idx ON public.system_access_requests(onboarding_process_id);

CREATE TABLE IF NOT EXISTS public.system_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.system_access_requests(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  system_id uuid NOT NULL REFERENCES public.system_access_systems(id),
  -- Either a group, a single resource, or neither (the whole system).
  group_id uuid REFERENCES public.system_access_groups(id),
  resource_id uuid REFERENCES public.system_access_resources(id),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'dispatched', 'active', 'rejected', 'revoked')),
  -- When access is meant to start (default: first working day 08:00) …
  effective_from timestamptz NOT NULL,
  -- … and when it really opened.
  executed_at timestamptz,
  executed_by uuid,
  executed_by_name text,
  external_username text,
  dispatch_ticket_id uuid REFERENCES public.it_tickets(id) ON DELETE SET NULL,
  dispatched_at timestamptz,
  rejection_reason text,
  note text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_access_grants_target_check CHECK (group_id IS NULL OR resource_id IS NULL)
);
CREATE INDEX IF NOT EXISTS system_access_grants_request_idx ON public.system_access_grants(request_id);
CREATE INDEX IF NOT EXISTS system_access_grants_dispatch_idx ON public.system_access_grants(dispatch_ticket_id);
-- One open grant per employee × system × target.
CREATE UNIQUE INDEX IF NOT EXISTS system_access_grants_one_open
  ON public.system_access_grants (
    employee_id, system_id,
    COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(resource_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('requested', 'dispatched', 'active');

DO $$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['system_access_requests', 'system_access_grants'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _t);
    -- Read-only for clients: every write goes through the functions below.
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', _t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', _t);
    EXECUTE format('CREATE POLICY "Staff view company system access requests" ON public.%I FOR SELECT TO authenticated USING (public.system_access_can_view(company_id))', _t);
  END LOOP;
END $$;

CREATE TRIGGER audit_system_access_grants AFTER INSERT OR UPDATE OR DELETE ON public.system_access_grants
FOR EACH ROW EXECUTE FUNCTION public.log_system_access_change();

-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.system_access_actor_name(_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT COALESCE((SELECT display_name FROM public.profiles WHERE user_id = _uid), 'משתמש מזוהה') $$;

-- Who runs the access hub of a company: dispatches, executes and rejects any grant.
CREATE OR REPLACE FUNCTION public.system_access_is_manager(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND _company_id IN (SELECT public.user_company_ids(auth.uid())));
$$;

-- Whether the caller is the owner of a system: its owner user, or a holder of its owner role.
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
      AND (s.owner_user_id = auth.uid() OR (s.owner_user_id IS NULL AND public.has_role(auth.uid(), s.owner_role)))
  );
$$;

-- A grant as one readable line: "כונן P · הנדסה (GRP_P_Engineering)".
CREATE OR REPLACE FUNCTION public.system_access_grant_label(_grant public.system_access_grants)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.name
    || COALESCE(' · ' || g.name || COALESCE(' (' || g.external_name || ')', ''), '')
    || COALESCE(' · ' || r.path, '')
  FROM public.system_access_systems s
  LEFT JOIN public.system_access_groups g ON g.id = _grant.group_id
  LEFT JOIN public.system_access_resources r ON r.id = _grant.resource_id
  WHERE s.id = _grant.system_id;
$$;

CREATE OR REPLACE FUNCTION public.system_access_status_label(_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _status
    WHEN 'requested' THEN 'ממתין'
    WHEN 'dispatched' THEN 'נשלח לאחראי'
    WHEN 'active' THEN 'נפתח'
    WHEN 'rejected' THEN 'נדחה'
    WHEN 'revoked' THEN 'נותק'
    ELSE _status END;
$$;

-- Mirror a request's grants into its hub ticket and owner tickets; close what is finished.
CREATE OR REPLACE FUNCTION public.sync_system_access_tickets(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.system_access_requests;
  _open int;
  _ticket uuid;
BEGIN
  SELECT * INTO _req FROM public.system_access_requests WHERE id = _request_id FOR UPDATE;
  IF _req.id IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO _open FROM public.system_access_grants
   WHERE request_id = _req.id AND status IN ('requested', 'dispatched');

  IF _req.hub_ticket_id IS NOT NULL THEN
    UPDATE public.it_tickets t
       SET checklist = (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'label', public.system_access_grant_label(g) || ' — ' || public.system_access_status_label(g.status)
                               || COALESCE(' · ' || g.executed_by_name, ''),
                      'done', g.status IN ('active', 'rejected', 'revoked'),
                      'grant_id', g.id) ORDER BY g.created_at, g.id), '[]'::jsonb)
             FROM public.system_access_grants g WHERE g.request_id = _req.id),
           status = CASE WHEN _open = 0 AND t.status <> 'done' THEN 'done'::ticket_status ELSE t.status END,
           resolved_at = CASE WHEN _open = 0 AND t.status <> 'done' THEN now() ELSE t.resolved_at END
     WHERE t.id = _req.hub_ticket_id;
  END IF;

  FOR _ticket IN SELECT DISTINCT dispatch_ticket_id FROM public.system_access_grants
                  WHERE request_id = _req.id AND dispatch_ticket_id IS NOT NULL LOOP
    UPDATE public.it_tickets t
       SET checklist = (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'label', public.system_access_grant_label(g),
                      'done', g.status IN ('active', 'rejected', 'revoked'),
                      'grant_id', g.id) ORDER BY g.created_at, g.id), '[]'::jsonb)
             FROM public.system_access_grants g WHERE g.dispatch_ticket_id = _ticket),
           status = CASE
             WHEN t.status <> 'done' AND NOT EXISTS (
               SELECT 1 FROM public.system_access_grants g
               WHERE g.dispatch_ticket_id = _ticket AND g.status IN ('requested', 'dispatched'))
             THEN 'done'::ticket_status ELSE t.status END,
           resolved_at = CASE
             WHEN t.status <> 'done' AND NOT EXISTS (
               SELECT 1 FROM public.system_access_grants g
               WHERE g.dispatch_ticket_id = _ticket AND g.status IN ('requested', 'dispatched'))
             THEN now() ELSE t.resolved_at END
     WHERE t.id = _ticket;
  END LOOP;

  UPDATE public.system_access_requests
     SET status = CASE WHEN _open = 0 THEN 'done' ELSE 'open' END,
         completed_at = CASE WHEN _open = 0 THEN COALESCE(completed_at, now()) ELSE NULL END
   WHERE id = _req.id;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_system_access_tickets(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- 1. Request. _items: [{"system_id": …, "group_id": …?, "resource_id": …?, "effective_from": …?}]
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
        AND g.status IN ('requested', 'dispatched', 'active')
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
                            'created', _created, 'skipped', _skipped);
END;
$$;
REVOKE ALL ON FUNCTION public.request_system_access(uuid, jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_system_access(uuid, jsonb, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------------------
-- 2. Dispatch: one owner ticket per owner, its checklist one line per grant.
CREATE OR REPLACE FUNCTION public.dispatch_system_access(_grant_ids uuid[], _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _company uuid;
  _owner record;
  _emp public.employees;
  _code text;
  _ticket uuid;
  _lines text;
  _out jsonb := '[]'::jsonb;
  _requests uuid[];
  _r uuid;
BEGIN
  IF _actor IS NULL OR coalesce(array_length(_grant_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'choose at least one grant';
  END IF;
  SELECT DISTINCT company_id INTO _company FROM public.system_access_grants WHERE id = ANY(_grant_ids);
  IF (SELECT count(DISTINCT company_id) FROM public.system_access_grants WHERE id = ANY(_grant_ids)) <> 1
     OR (SELECT count(DISTINCT employee_id) FROM public.system_access_grants WHERE id = ANY(_grant_ids)) <> 1 THEN
    RAISE EXCEPTION 'grants must belong to one employee';
  END IF;
  IF NOT public.system_access_is_manager(_company) THEN
    RAISE EXCEPTION 'not authorized to dispatch access';
  END IF;
  IF EXISTS (SELECT 1 FROM public.system_access_grants WHERE id = ANY(_grant_ids) AND status <> 'requested') THEN
    RAISE EXCEPTION 'only waiting grants can be sent to their owner';
  END IF;

  SELECT e.* INTO _emp FROM public.employees e
   WHERE e.id = (SELECT employee_id FROM public.system_access_grants WHERE id = _grant_ids[1]);
  SELECT array_agg(DISTINCT request_id) INTO _requests FROM public.system_access_grants WHERE id = ANY(_grant_ids);

  FOR _owner IN
    SELECT s.owner_role, s.owner_user_id, array_agg(g.id ORDER BY g.created_at) AS ids, min(g.effective_from) AS starts
      FROM public.system_access_grants g JOIN public.system_access_systems s ON s.id = g.system_id
     WHERE g.id = ANY(_grant_ids)
     GROUP BY s.owner_role, s.owner_user_id
  LOOP
    SELECT string_agg('• ' || public.system_access_grant_label(g) || ' — בתוקף מ-'
                      || to_char(g.effective_from AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI'), E'\n' ORDER BY g.created_at)
      INTO _lines FROM public.system_access_grants g WHERE g.id = ANY(_owner.ids);
    _code := 'ACC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    INSERT INTO public.it_tickets (ticket_code, company_id, title, description, employee_id, ticket_type, subject_category, priority, status, sla_deadline, assigned_to)
    VALUES (
      _code, _company,
      'פתיחת הרשאות – ' || _emp.full_name,
      'לפתוח ל' || _emp.full_name || COALESCE(' (' || _emp.role || COALESCE(', ' || _emp.department, '') || ')', '') || ':' || E'\n' || _lines
        || COALESCE(E'\n\n' || NULLIF(btrim(COALESCE(_note, '')), ''), '')
        || E'\n\nסמנו כל שורה כשנפתחה, או סגרו את הקריאה כשהכול נפתח. נשלח ע"י ' || public.system_access_actor_name(_actor) || '.',
      _emp.id, 'access', 'access', 'medium', 'open', _owner.starts, _owner.owner_user_id)
    RETURNING id INTO _ticket;

    UPDATE public.system_access_grants
       SET status = 'dispatched', dispatch_ticket_id = _ticket, dispatched_at = now()
     WHERE id = ANY(_owner.ids);

    _out := _out || jsonb_build_object('ticketId', _ticket, 'ticketCode', _code, 'ownerRole', _owner.owner_role,
                                       'count', array_length(_owner.ids, 1));
  END LOOP;

  FOREACH _r IN ARRAY _requests LOOP
    PERFORM public.sync_system_access_tickets(_r);
  END LOOP;
  RETURN _out;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_system_access(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_system_access(uuid[], text) TO authenticated;

-- ---------------------------------------------------------------------------------------
-- 3. Resolve one grant: 'done', 'reject' (reason required) or 'return' (owner sends it back).
CREATE OR REPLACE FUNCTION public.resolve_system_access_grant(
  _grant_id uuid,
  _action text,
  _executed_at timestamptz DEFAULT NULL,
  _external_username text DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS public.system_access_grants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _grant public.system_access_grants;
  _manager boolean;
  _owner boolean;
  _clean_note text := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  SELECT * INTO _grant FROM public.system_access_grants WHERE id = _grant_id FOR UPDATE;
  IF _grant.id IS NULL OR _actor IS NULL THEN
    RAISE EXCEPTION 'grant not found';
  END IF;
  _manager := public.system_access_is_manager(_grant.company_id);
  _owner := _grant.status = 'dispatched' AND public.system_access_is_owner(_grant.system_id);
  IF NOT (_manager OR _owner) THEN
    RAISE EXCEPTION 'not authorized to resolve this grant';
  END IF;
  IF _grant.status NOT IN ('requested', 'dispatched') THEN
    RAISE EXCEPTION 'this grant is already resolved';
  END IF;

  IF _action = 'done' THEN
    UPDATE public.system_access_grants
       SET status = 'active',
           executed_at = LEAST(COALESCE(_executed_at, now()), now()),
           executed_by = _actor,
           executed_by_name = public.system_access_actor_name(_actor),
           external_username = NULLIF(btrim(COALESCE(_external_username, '')), ''),
           note = COALESCE(_clean_note, note)
     WHERE id = _grant.id RETURNING * INTO _grant;
  ELSIF _action = 'reject' THEN
    IF _clean_note IS NULL THEN
      RAISE EXCEPTION 'a reason is required to reject';
    END IF;
    UPDATE public.system_access_grants
       SET status = 'rejected', rejection_reason = _clean_note,
           executed_by = _actor, executed_by_name = public.system_access_actor_name(_actor)
     WHERE id = _grant.id RETURNING * INTO _grant;
  ELSIF _action = 'return' THEN
    IF _grant.status <> 'dispatched' THEN
      RAISE EXCEPTION 'only a grant sent to its owner can be returned';
    END IF;
    IF _clean_note IS NULL THEN
      RAISE EXCEPTION 'say why the grant is returned';
    END IF;
    UPDATE public.system_access_grants
       SET status = 'requested', dispatch_ticket_id = NULL, dispatched_at = NULL,
           note = 'הוחזר ע"י ' || public.system_access_actor_name(_actor) || ': ' || _clean_note
     WHERE id = _grant.id RETURNING * INTO _grant;
  ELSE
    RAISE EXCEPTION 'unknown action %', _action;
  END IF;

  PERFORM public.sync_system_access_tickets(_grant.request_id);
  RETURN _grant;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_system_access_grant(uuid, text, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_system_access_grant(uuid, text, timestamptz, text, text) TO authenticated;

-- ---------------------------------------------------------------------------------------
-- 4. The owner works from the ticket screen: a ticked line, or a closed ticket, opens the grants.
CREATE OR REPLACE FUNCTION public.system_access_ticket_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _grant public.system_access_grants;
  _requests uuid[] := '{}';
  _r uuid;
BEGIN
  -- Ticket updates made by the sync itself are not user actions.
  IF pg_trigger_depth() > 1 OR NEW.ticket_type <> 'access' THEN
    RETURN NULL;
  END IF;
  FOR _grant IN
    SELECT g.* FROM public.system_access_grants g
     WHERE g.status IN ('requested', 'dispatched')
       AND (
         -- The owner's ticket: a ticked line or the closed ticket.
         (g.dispatch_ticket_id = NEW.id AND (NEW.status = 'done' OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.checklist, '[]'::jsonb)) c
            WHERE c->>'grant_id' = g.id::text AND (c->>'done')::boolean)))
         -- The manager's hub ticket: a ticked line (closing the hub does not open anything).
         OR (EXISTS (SELECT 1 FROM public.system_access_requests r WHERE r.id = g.request_id AND r.hub_ticket_id = NEW.id)
             AND public.system_access_is_manager(g.company_id)
             AND EXISTS (
               SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.checklist, '[]'::jsonb)) c
               WHERE c->>'grant_id' = g.id::text AND (c->>'done')::boolean)))
     FOR UPDATE
  LOOP
    UPDATE public.system_access_grants
       SET status = 'active', executed_at = now(), executed_by = _actor,
           executed_by_name = CASE WHEN _actor IS NULL THEN 'סגירת קריאה' ELSE public.system_access_actor_name(_actor) END
     WHERE id = _grant.id;
    _requests := _requests || _grant.request_id;
  END LOOP;
  FOREACH _r IN ARRAY (SELECT COALESCE(array_agg(DISTINCT x), '{}') FROM unnest(_requests) x) LOOP
    PERFORM public.sync_system_access_tickets(_r);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS it_tickets_system_access_progress ON public.it_tickets;
CREATE TRIGGER it_tickets_system_access_progress
AFTER UPDATE OF checklist, status ON public.it_tickets
FOR EACH ROW
WHEN (NEW.ticket_type = 'access')
EXECUTE FUNCTION public.system_access_ticket_progress();

-- ---------------------------------------------------------------------------------------
-- The onboarding form keeps the access HR picked until the process is sent; sending turns the
-- picks into a request (request_system_access with the process id).
ALTER TABLE public.onboarding_processes ADD COLUMN IF NOT EXISTS access_picks jsonb;
COMMENT ON COLUMN public.onboarding_processes.access_picks IS
  'System access picked in the onboarding form, [{system_id, group_id?, resource_id?, effective_from?}], requested when the process is sent.';

-- Revoking system access, the same chain in reverse.
--
-- When an employee starts leaving (start_employee_offboarding sets status 'leaving'), every
-- access they hold becomes one revoke request with a hub ticket for the access manager. The
-- manager revokes, or sends to the owner (one ticket per owner); the owner revokes, returns, or
-- ticks the line in their ticket. A revoked grant keeps its whole history: from when it was
-- meant to start, when it opened and by whom, and when it was revoked and by whom.
-- Cancelling the offboarding (status back to 'active') cancels what was not revoked yet.
--
-- A grant moves active → revoke_requested → (revoke_dispatched) → revoked. The functions of
-- 20261110230000 are replaced here to handle both directions.

ALTER TABLE public.system_access_grants
  ADD COLUMN IF NOT EXISTS revoke_request_id uuid REFERENCES public.system_access_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoke_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoke_dispatch_ticket_id uuid REFERENCES public.it_tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoke_dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid,
  ADD COLUMN IF NOT EXISTS revoked_by_name text,
  ADD COLUMN IF NOT EXISTS revoke_note text;
CREATE INDEX IF NOT EXISTS system_access_grants_revoke_request_idx ON public.system_access_grants(revoke_request_id);
CREATE INDEX IF NOT EXISTS system_access_grants_revoke_dispatch_idx ON public.system_access_grants(revoke_dispatch_ticket_id);

ALTER TABLE public.system_access_grants DROP CONSTRAINT IF EXISTS system_access_grants_status_check;
ALTER TABLE public.system_access_grants ADD CONSTRAINT system_access_grants_status_check
  CHECK (status IN ('requested', 'dispatched', 'active', 'rejected', 'revoke_requested', 'revoke_dispatched', 'revoked'));

-- Access still held (including while its revocation is pending) is not requested twice.
DROP INDEX IF EXISTS public.system_access_grants_one_open;
CREATE UNIQUE INDEX system_access_grants_one_open
  ON public.system_access_grants (
    employee_id, system_id,
    COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(resource_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('requested', 'dispatched', 'active', 'revoke_requested', 'revoke_dispatched');

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
    WHEN 'revoke_requested' THEN 'ממתין לניתוק'
    WHEN 'revoke_dispatched' THEN 'נשלח לאחראי לניתוק'
    WHEN 'revoked' THEN 'נותק'
    ELSE _status END;
$$;

-- Grants that belong to a request: by request_id for a grant request, by revoke_request_id for a revoke.
CREATE OR REPLACE FUNCTION public.system_access_request_grants(_request public.system_access_requests)
RETURNS SETOF public.system_access_grants
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.* FROM public.system_access_grants g
   WHERE (_request.kind = 'grant' AND g.request_id = _request.id)
      OR (_request.kind = 'revoke' AND g.revoke_request_id = _request.id);
$$;

-- Whether a grant still waits for something in this request's direction.
CREATE OR REPLACE FUNCTION public.system_access_grant_open(_kind text, _status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN _kind = 'revoke' THEN _status IN ('revoke_requested', 'revoke_dispatched')
              ELSE _status IN ('requested', 'dispatched') END;
$$;

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

  SELECT count(*) INTO _open FROM public.system_access_request_grants(_req) g
   WHERE public.system_access_grant_open(_req.kind, g.status);

  IF _req.hub_ticket_id IS NOT NULL THEN
    UPDATE public.it_tickets t
       SET checklist = (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'label', public.system_access_grant_label(g) || ' — '
                               || CASE WHEN _req.kind = 'revoke' AND g.status = 'active' THEN 'הניתוק בוטל'
                                       ELSE public.system_access_status_label(g.status) END
                               || COALESCE(' · ' || CASE WHEN _req.kind = 'revoke' THEN g.revoked_by_name ELSE g.executed_by_name END, ''),
                      'done', NOT public.system_access_grant_open(_req.kind, g.status),
                      'grant_id', g.id) ORDER BY g.created_at, g.id), '[]'::jsonb)
             FROM public.system_access_request_grants(_req) g),
           status = CASE WHEN _open = 0 AND t.status <> 'done' THEN 'done'::ticket_status ELSE t.status END,
           resolved_at = CASE WHEN _open = 0 AND t.status <> 'done' THEN now() ELSE t.resolved_at END
     WHERE t.id = _req.hub_ticket_id;
  END IF;

  FOR _ticket IN
    SELECT DISTINCT CASE WHEN _req.kind = 'revoke' THEN g.revoke_dispatch_ticket_id ELSE g.dispatch_ticket_id END
      FROM public.system_access_request_grants(_req) g
     WHERE CASE WHEN _req.kind = 'revoke' THEN g.revoke_dispatch_ticket_id ELSE g.dispatch_ticket_id END IS NOT NULL
  LOOP
    UPDATE public.it_tickets t
       SET checklist = (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'label', public.system_access_grant_label(g),
                      'done', NOT public.system_access_grant_open(_req.kind, g.status),
                      'grant_id', g.id) ORDER BY g.created_at, g.id), '[]'::jsonb)
             FROM public.system_access_grants g
             WHERE (_req.kind = 'grant' AND g.dispatch_ticket_id = _ticket)
                OR (_req.kind = 'revoke' AND g.revoke_dispatch_ticket_id = _ticket)),
           status = CASE
             WHEN t.status <> 'done' AND NOT EXISTS (
               SELECT 1 FROM public.system_access_grants g
               WHERE ((_req.kind = 'grant' AND g.dispatch_ticket_id = _ticket) OR (_req.kind = 'revoke' AND g.revoke_dispatch_ticket_id = _ticket))
                 AND public.system_access_grant_open(_req.kind, g.status))
             THEN 'done'::ticket_status ELSE t.status END,
           resolved_at = CASE
             WHEN t.status <> 'done' AND NOT EXISTS (
               SELECT 1 FROM public.system_access_grants g
               WHERE ((_req.kind = 'grant' AND g.dispatch_ticket_id = _ticket) OR (_req.kind = 'revoke' AND g.revoke_dispatch_ticket_id = _ticket))
                 AND public.system_access_grant_open(_req.kind, g.status))
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
-- Creating a revoke request. Internal: callers check authorization first.
CREATE OR REPLACE FUNCTION public.create_system_access_revocation(
  _emp public.employees,
  _actor uuid,
  _grant_ids uuid[],
  _due_at timestamptz,
  _note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.system_access_requests;
  _count int;
  _code text;
  _ticket uuid;
BEGIN
  INSERT INTO public.system_access_requests (company_id, employee_id, kind, requested_by, requested_by_name, note)
  VALUES (_emp.company_id, _emp.id, 'revoke', _actor,
          CASE WHEN _actor IS NULL THEN 'תהליך עזיבה' ELSE public.system_access_actor_name(_actor) END,
          NULLIF(btrim(COALESCE(_note, '')), ''))
  RETURNING * INTO _req;

  UPDATE public.system_access_grants
     SET status = 'revoke_requested', revoke_request_id = _req.id, revoke_due_at = _due_at,
         revoke_dispatch_ticket_id = NULL, revoke_dispatched_at = NULL, revoke_note = NULL
   WHERE employee_id = _emp.id AND company_id = _emp.company_id AND status = 'active'
     AND (_grant_ids IS NULL OR id = ANY(_grant_ids));
  GET DIAGNOSTICS _count = ROW_COUNT;

  IF _count = 0 THEN
    DELETE FROM public.system_access_requests WHERE id = _req.id;
    RETURN jsonb_build_object('requestId', NULL, 'count', 0);
  END IF;

  _code := 'ACC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  INSERT INTO public.it_tickets (ticket_code, company_id, title, description, employee_id, ticket_type, subject_category, priority, status, sla_deadline)
  VALUES (
    _code, _emp.company_id,
    'ניתוק הרשאות – ' || _emp.full_name,
    'ניתוק כל ההרשאות למערכות של ' || _emp.full_name || COALESCE(' (' || _emp.employee_code || ')', '')
      || COALESCE('. לנתק עד ' || to_char(_due_at AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI'), '')
      || '. ביקש/ה: ' || _req.requested_by_name || COALESCE('. הערה: ' || _req.note, '') || '. הטיפול במסך הרשאות מערכות.',
    _emp.id, 'access', 'access', 'high', 'open', _due_at)
  RETURNING id INTO _ticket;
  UPDATE public.system_access_requests SET hub_ticket_id = _ticket WHERE id = _req.id;
  PERFORM public.sync_system_access_tickets(_req.id);
  RETURN jsonb_build_object('requestId', _req.id, 'ticketId', _ticket, 'ticketCode', _code, 'count', _count);
END;
$$;
REVOKE ALL ON FUNCTION public.create_system_access_revocation(public.employees, uuid, uuid[], timestamptz, text) FROM PUBLIC, anon, authenticated;

-- Revoke some or all of an employee's access by hand (e.g. a department move). Due by default now.
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
    _emp.company_id IN (SELECT public.user_company_ids(_actor))
    AND (public.has_role(_actor, 'admin') OR public.has_role(_actor, 'hr')
         OR public.is_operations(_actor) OR public.has_role(_actor, 'it_manager'))
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
REVOKE ALL ON FUNCTION public.request_system_access_revocation(uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_system_access_revocation(uuid, uuid[], text) TO authenticated;

-- Offboarding: starting it revokes everything by the last working day 17:00; cancelling it
-- cancels what was not revoked yet.
CREATE OR REPLACE FUNCTION public.system_access_follow_employee_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req uuid;
BEGIN
  IF NEW.status = 'leaving' AND OLD.status IS DISTINCT FROM 'leaving' THEN
    PERFORM public.create_system_access_revocation(
      NEW, auth.uid(), NULL,
      COALESCE((NEW.end_date + time '17:00') AT TIME ZONE 'Asia/Jerusalem', date_trunc('minute', now())),
      'נפתח אוטומטית עם תחילת תהליך העזיבה');
  ELSIF OLD.status = 'leaving' AND NEW.status = 'active' THEN
    FOR _req IN
      SELECT DISTINCT revoke_request_id FROM public.system_access_grants
       WHERE employee_id = NEW.id AND status IN ('revoke_requested', 'revoke_dispatched') AND revoke_request_id IS NOT NULL
    LOOP
      UPDATE public.system_access_grants
         SET status = 'active', revoke_note = 'הניתוק בוטל: תהליך העזיבה בוטל'
       WHERE revoke_request_id = _req AND status IN ('revoke_requested', 'revoke_dispatched');
      PERFORM public.sync_system_access_tickets(_req);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS employees_system_access_status ON public.employees;
CREATE TRIGGER employees_system_access_status
AFTER UPDATE OF status ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.system_access_follow_employee_status();

-- ---------------------------------------------------------------------------------------
-- Dispatch, both directions: waiting grants (all of one direction) to their owners.
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
  _revoke boolean;
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
  IF (SELECT count(DISTINCT company_id) FROM public.system_access_grants WHERE id = ANY(_grant_ids)) <> 1
     OR (SELECT count(DISTINCT employee_id) FROM public.system_access_grants WHERE id = ANY(_grant_ids)) <> 1 THEN
    RAISE EXCEPTION 'grants must belong to one employee';
  END IF;
  SELECT company_id INTO _company FROM public.system_access_grants WHERE id = _grant_ids[1];
  IF NOT public.system_access_is_manager(_company) THEN
    RAISE EXCEPTION 'not authorized to dispatch access';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.system_access_grants WHERE id = ANY(_grant_ids) AND status <> 'requested') THEN
    _revoke := false;
  ELSIF NOT EXISTS (SELECT 1 FROM public.system_access_grants WHERE id = ANY(_grant_ids) AND status <> 'revoke_requested') THEN
    _revoke := true;
  ELSE
    RAISE EXCEPTION 'only waiting grants can be sent to their owner';
  END IF;

  SELECT e.* INTO _emp FROM public.employees e
   WHERE e.id = (SELECT employee_id FROM public.system_access_grants WHERE id = _grant_ids[1]);
  SELECT array_agg(DISTINCT CASE WHEN _revoke THEN revoke_request_id ELSE request_id END)
    INTO _requests FROM public.system_access_grants WHERE id = ANY(_grant_ids);

  FOR _owner IN
    SELECT s.owner_role, s.owner_user_id, array_agg(g.id ORDER BY g.created_at) AS ids,
           min(CASE WHEN _revoke THEN g.revoke_due_at ELSE g.effective_from END) AS due
      FROM public.system_access_grants g JOIN public.system_access_systems s ON s.id = g.system_id
     WHERE g.id = ANY(_grant_ids)
     GROUP BY s.owner_role, s.owner_user_id
  LOOP
    SELECT string_agg('• ' || public.system_access_grant_label(g)
                      || CASE WHEN _revoke THEN COALESCE(' — משתמש: ' || g.external_username, '')
                              ELSE ' — בתוקף מ-' || to_char(g.effective_from AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI') END,
                      E'\n' ORDER BY g.created_at)
      INTO _lines FROM public.system_access_grants g WHERE g.id = ANY(_owner.ids);
    _code := 'ACC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    INSERT INTO public.it_tickets (ticket_code, company_id, title, description, employee_id, ticket_type, subject_category, priority, status, sla_deadline, assigned_to)
    VALUES (
      _code, _company,
      CASE WHEN _revoke THEN 'ניתוק הרשאות – ' ELSE 'פתיחת הרשאות – ' END || _emp.full_name,
      CASE WHEN _revoke THEN 'לנתק ל' ELSE 'לפתוח ל' END || _emp.full_name
        || COALESCE(' (' || _emp.role || COALESCE(', ' || _emp.department, '') || ')', '')
        || CASE WHEN _revoke THEN COALESCE(' עד ' || to_char(_owner.due AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI'), '') ELSE '' END
        || ':' || E'\n' || _lines
        || COALESCE(E'\n\n' || NULLIF(btrim(COALESCE(_note, '')), ''), '')
        || E'\n\nסמנו כל שורה כש' || CASE WHEN _revoke THEN 'נותקה' ELSE 'נפתחה' END
        || ', או סגרו את הקריאה כשהכול טופל. נשלח ע"י ' || public.system_access_actor_name(_actor) || '.',
      _emp.id, 'access', 'access', CASE WHEN _revoke THEN 'high' ELSE 'medium' END::ticket_priority, 'open', _owner.due, _owner.owner_user_id)
    RETURNING id INTO _ticket;

    IF _revoke THEN
      UPDATE public.system_access_grants
         SET status = 'revoke_dispatched', revoke_dispatch_ticket_id = _ticket, revoke_dispatched_at = now()
       WHERE id = ANY(_owner.ids);
    ELSE
      UPDATE public.system_access_grants
         SET status = 'dispatched', dispatch_ticket_id = _ticket, dispatched_at = now()
       WHERE id = ANY(_owner.ids);
    END IF;

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
-- Resolve, both directions. Revocations cannot be rejected: leaving access open is not an option.
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
  _revoke boolean;
  _clean_note text := NULLIF(btrim(COALESCE(_note, '')), '');
  _name text;
BEGIN
  SELECT * INTO _grant FROM public.system_access_grants WHERE id = _grant_id FOR UPDATE;
  IF _grant.id IS NULL OR _actor IS NULL THEN
    RAISE EXCEPTION 'grant not found';
  END IF;
  _revoke := _grant.status IN ('revoke_requested', 'revoke_dispatched');
  _manager := public.system_access_is_manager(_grant.company_id);
  _owner := _grant.status IN ('dispatched', 'revoke_dispatched') AND public.system_access_is_owner(_grant.system_id);
  IF NOT (_manager OR _owner) THEN
    RAISE EXCEPTION 'not authorized to resolve this grant';
  END IF;
  IF _grant.status NOT IN ('requested', 'dispatched', 'revoke_requested', 'revoke_dispatched') THEN
    RAISE EXCEPTION 'this grant is already resolved';
  END IF;
  _name := public.system_access_actor_name(_actor);

  IF _action = 'done' AND _revoke THEN
    UPDATE public.system_access_grants
       SET status = 'revoked',
           revoked_at = LEAST(COALESCE(_executed_at, now()), now()),
           revoked_by = _actor, revoked_by_name = _name,
           revoke_note = COALESCE(_clean_note, revoke_note)
     WHERE id = _grant.id RETURNING * INTO _grant;
  ELSIF _action = 'done' THEN
    UPDATE public.system_access_grants
       SET status = 'active',
           executed_at = LEAST(COALESCE(_executed_at, now()), now()),
           executed_by = _actor, executed_by_name = _name,
           external_username = NULLIF(btrim(COALESCE(_external_username, '')), ''),
           note = COALESCE(_clean_note, note)
     WHERE id = _grant.id RETURNING * INTO _grant;
  ELSIF _action = 'reject' THEN
    IF _revoke THEN
      RAISE EXCEPTION 'a revocation cannot be rejected';
    END IF;
    IF _clean_note IS NULL THEN
      RAISE EXCEPTION 'a reason is required to reject';
    END IF;
    UPDATE public.system_access_grants
       SET status = 'rejected', rejection_reason = _clean_note, executed_by = _actor, executed_by_name = _name
     WHERE id = _grant.id RETURNING * INTO _grant;
  ELSIF _action = 'return' THEN
    IF _grant.status NOT IN ('dispatched', 'revoke_dispatched') THEN
      RAISE EXCEPTION 'only a grant sent to its owner can be returned';
    END IF;
    IF _clean_note IS NULL THEN
      RAISE EXCEPTION 'say why the grant is returned';
    END IF;
    IF _revoke THEN
      UPDATE public.system_access_grants
         SET status = 'revoke_requested', revoke_dispatch_ticket_id = NULL, revoke_dispatched_at = NULL,
             revoke_note = 'הוחזר ע"י ' || _name || ': ' || _clean_note
       WHERE id = _grant.id RETURNING * INTO _grant;
    ELSE
      UPDATE public.system_access_grants
         SET status = 'requested', dispatch_ticket_id = NULL, dispatched_at = NULL,
             note = 'הוחזר ע"י ' || _name || ': ' || _clean_note
       WHERE id = _grant.id RETURNING * INTO _grant;
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown action %', _action;
  END IF;

  PERFORM public.sync_system_access_tickets(CASE WHEN _revoke THEN _grant.revoke_request_id ELSE _grant.request_id END);
  RETURN _grant;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_system_access_grant(uuid, text, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_system_access_grant(uuid, text, timestamptz, text, text) TO authenticated;

-- ---------------------------------------------------------------------------------------
-- Ticket screen, both directions: ticked lines and closed owner tickets resolve their grants.
CREATE OR REPLACE FUNCTION public.system_access_ticket_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _name text := CASE WHEN auth.uid() IS NULL THEN 'סגירת קריאה' ELSE public.system_access_actor_name(auth.uid()) END;
  _grant public.system_access_grants;
  _requests uuid[] := '{}';
  _r uuid;
  _ticked boolean;
BEGIN
  IF pg_trigger_depth() > 1 OR NEW.ticket_type <> 'access' THEN
    RETURN NULL;
  END IF;
  FOR _grant IN
    SELECT g.* FROM public.system_access_grants g
     WHERE g.status IN ('requested', 'dispatched', 'revoke_requested', 'revoke_dispatched')
       AND (g.dispatch_ticket_id = NEW.id OR g.revoke_dispatch_ticket_id = NEW.id
            OR EXISTS (SELECT 1 FROM public.system_access_requests r
                       WHERE r.hub_ticket_id = NEW.id AND (r.id = g.request_id OR r.id = g.revoke_request_id)))
     FOR UPDATE
  LOOP
    _ticked := EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.checklist, '[]'::jsonb)) c
      WHERE c->>'grant_id' = _grant.id::text AND (c->>'done')::boolean);
    IF _grant.status = 'dispatched' AND _grant.dispatch_ticket_id = NEW.id AND (NEW.status = 'done' OR _ticked)
       OR _grant.status = 'requested' AND _ticked AND public.system_access_is_manager(_grant.company_id)
          AND EXISTS (SELECT 1 FROM public.system_access_requests r WHERE r.id = _grant.request_id AND r.hub_ticket_id = NEW.id) THEN
      UPDATE public.system_access_grants
         SET status = 'active', executed_at = now(), executed_by = _actor, executed_by_name = _name
       WHERE id = _grant.id;
      _requests := _requests || _grant.request_id;
    ELSIF _grant.status = 'revoke_dispatched' AND _grant.revoke_dispatch_ticket_id = NEW.id AND (NEW.status = 'done' OR _ticked)
       OR _grant.status = 'revoke_requested' AND _ticked AND public.system_access_is_manager(_grant.company_id)
          AND EXISTS (SELECT 1 FROM public.system_access_requests r WHERE r.id = _grant.revoke_request_id AND r.hub_ticket_id = NEW.id) THEN
      UPDATE public.system_access_grants
         SET status = 'revoked', revoked_at = now(), revoked_by = _actor, revoked_by_name = _name
       WHERE id = _grant.id;
      _requests := _requests || _grant.revoke_request_id;
    END IF;
  END LOOP;
  FOREACH _r IN ARRAY (SELECT COALESCE(array_agg(DISTINCT x), '{}') FROM unnest(_requests) x) LOOP
    PERFORM public.sync_system_access_tickets(_r);
  END LOOP;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------------------
-- Requests: access pending revocation still counts as held, so it is not requested twice.
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
                            'created', _created, 'skipped', _skipped);
END;
$$;
REVOKE ALL ON FUNCTION public.request_system_access(uuid, jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_system_access(uuid, jsonb, uuid, text) TO authenticated;

-- Automatic folder-tree scan: the office agent (agent-py) walks a drive and sends the folder list,
-- so the tree stays current without a manual CSV import.
--
-- Each system gets its own scan key: generated once by an admin or IT, shown once, stored only as
-- a SHA-256 hash, and valid for that one system (so for one company). The agent sends the key to
-- the ingest-access-tree function, which calls ingest_system_access_tree with the service role.
-- The import itself is the one the CSV upload uses (import_system_access_tree_core): new folders
-- are added, missing ones flagged, assignments kept, and one audit row is written per scan.

ALTER TABLE public.system_access_systems
  ADD COLUMN IF NOT EXISTS scan_last_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_last_result jsonb,
  ADD COLUMN IF NOT EXISTS scan_agent text;

-- Key hashes live apart from the catalog, with no client access at all (RLS on, no policies).
CREATE TABLE IF NOT EXISTS public.system_access_scan_keys (
  system_id uuid PRIMARY KEY REFERENCES public.system_access_systems(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.system_access_scan_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_access_scan_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.system_access_scan_keys TO service_role;

-- ---------------------------------------------------------------------------------------
-- The import, shared by the manual upload and the agent. Callers check authorization.
CREATE OR REPLACE FUNCTION public.import_system_access_tree_core(
  _system public.system_access_systems,
  _paths text[],
  _actor uuid,
  _source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _path text;
  _segments text[];
  _prefix text;
  _parent uuid;
  _id uuid;
  _i int;
  _seen text[] := '{}';
  _added int := 0;
  _missing int := 0;
  _returned int := 0;
BEGIN
  IF coalesce(array_length(_paths, 1), 0) > 20000 THEN
    RAISE EXCEPTION 'too many paths in one import';
  END IF;

  FOREACH _path IN ARRAY coalesce(_paths, '{}') LOOP
    _segments := array_remove(regexp_split_to_array(btrim(_path), '\\+'), '');
    _parent := NULL;
    _prefix := NULL;
    FOR _i IN 1 .. coalesce(array_length(_segments, 1), 0) LOOP
      _prefix := CASE WHEN _prefix IS NULL THEN btrim(_segments[_i]) ELSE _prefix || '\' || btrim(_segments[_i]) END;
      _seen := _seen || _prefix;
      SELECT id INTO _id FROM public.system_access_resources WHERE system_id = _system.id AND path = _prefix;
      IF _id IS NULL THEN
        INSERT INTO public.system_access_resources (system_id, company_id, parent_id, name, path)
        VALUES (_system.id, _system.company_id, _parent, btrim(_segments[_i]), _prefix)
        RETURNING id INTO _id;
        _added := _added + 1;
      END IF;
      _parent := _id;
    END LOOP;
  END LOOP;

  UPDATE public.system_access_resources
     SET missing_since = NULL
   WHERE system_id = _system.id AND missing_since IS NOT NULL AND path = ANY(_seen);
  GET DIAGNOSTICS _returned = ROW_COUNT;

  UPDATE public.system_access_resources
     SET missing_since = now()
   WHERE system_id = _system.id AND missing_since IS NULL AND NOT (path = ANY(_seen));
  GET DIAGNOSTICS _missing = ROW_COUNT;

  INSERT INTO public.permission_audit_log (actor_user_id, company_id, action, details)
  VALUES (_actor, _system.company_id, 'system_access_tree_import',
          _source || ' ל' || _system.name || ': ' || _added || ' חדשים, ' || _missing || ' חסרים, ' || _returned || ' חזרו');

  RETURN jsonb_build_object('added', _added, 'missing', _missing, 'returned', _returned,
                            'total', (SELECT count(*) FROM public.system_access_resources WHERE system_id = _system.id));
END;
$$;
REVOKE ALL ON FUNCTION public.import_system_access_tree_core(public.system_access_systems, text[], uuid, text) FROM PUBLIC, anon, authenticated;

-- The manual CSV import, now on the shared core.
CREATE OR REPLACE FUNCTION public.import_system_access_tree(_system_id uuid, _paths text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _system public.system_access_systems;
BEGIN
  SELECT * INTO _system FROM public.system_access_systems WHERE id = _system_id;
  IF _system.id IS NULL OR NOT public.system_access_can_manage(_system.company_id) THEN
    RAISE EXCEPTION 'not authorized to import into this system';
  END IF;
  RETURN public.import_system_access_tree_core(_system, _paths, auth.uid(), 'ייבוא עץ');
END;
$$;
REVOKE ALL ON FUNCTION public.import_system_access_tree(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_system_access_tree(uuid, text[]) TO authenticated;

-- ---------------------------------------------------------------------------------------
-- A new scan key for a system (replaces the old one). Returned once; only its hash is kept.
CREATE OR REPLACE FUNCTION public.create_system_access_scan_token(_system_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _system public.system_access_systems;
  _token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  SELECT * INTO _system FROM public.system_access_systems WHERE id = _system_id;
  IF _system.id IS NULL OR NOT public.system_access_can_manage(_system.company_id) THEN
    RAISE EXCEPTION 'not authorized to manage this system';
  END IF;
  INSERT INTO public.system_access_scan_keys (system_id, token_hash, created_by)
  VALUES (_system.id, encode(sha256(convert_to(_token, 'UTF8')), 'hex'), auth.uid())
  ON CONFLICT (system_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_by = EXCLUDED.created_by, created_at = now();
  INSERT INTO public.permission_audit_log (actor_user_id, company_id, action, details)
  VALUES (auth.uid(), _system.company_id, 'system_access_scan_token_created', 'מפתח סריקה חדש ל' || _system.name);
  RETURN _token;
END;
$$;
REVOKE ALL ON FUNCTION public.create_system_access_scan_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_system_access_scan_token(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_system_access_scan_token(_system_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _system public.system_access_systems;
BEGIN
  SELECT * INTO _system FROM public.system_access_systems WHERE id = _system_id;
  IF _system.id IS NULL OR NOT public.system_access_can_manage(_system.company_id) THEN
    RAISE EXCEPTION 'not authorized to manage this system';
  END IF;
  DELETE FROM public.system_access_scan_keys WHERE system_id = _system.id;
  INSERT INTO public.permission_audit_log (actor_user_id, company_id, action, details)
  VALUES (auth.uid(), _system.company_id, 'system_access_scan_token_revoked', 'מפתח הסריקה של ' || _system.name || ' בוטל');
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_system_access_scan_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_system_access_scan_token(uuid) TO authenticated;

-- Whether a system has a scan key, and how its last scan went.
CREATE OR REPLACE FUNCTION public.system_access_scan_status(_system_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('connected', EXISTS (SELECT 1 FROM public.system_access_scan_keys k WHERE k.system_id = s.id),
                            'last_at', s.scan_last_at,
                            'last_result', s.scan_last_result, 'agent', s.scan_agent)
  FROM public.system_access_systems s
  WHERE s.id = _system_id AND public.system_access_can_view(s.company_id);
$$;
REVOKE ALL ON FUNCTION public.system_access_scan_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.system_access_scan_status(uuid) TO authenticated;

-- The agent's scan, through ingest-access-tree (service role only): the key must be this system's.
CREATE OR REPLACE FUNCTION public.ingest_system_access_tree(_system_id uuid, _token text, _paths text[], _agent text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _system public.system_access_systems;
  _hash text;
  _result jsonb;
BEGIN
  SELECT * INTO _system FROM public.system_access_systems WHERE id = _system_id AND is_active;
  SELECT token_hash INTO _hash FROM public.system_access_scan_keys WHERE system_id = _system_id;
  IF _system.id IS NULL OR _hash IS NULL OR _token IS NULL
     OR _hash <> encode(sha256(convert_to(_token, 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'invalid scan key';
  END IF;
  _result := public.import_system_access_tree_core(
    _system, _paths, NULL, 'סריקה אוטומטית' || COALESCE(' (' || left(btrim(_agent), 80) || ')', ''));
  UPDATE public.system_access_systems
     SET scan_last_at = now(), scan_last_result = _result, scan_agent = left(btrim(COALESCE(_agent, '')), 80)
   WHERE id = _system.id;
  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.ingest_system_access_tree(uuid, text, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_system_access_tree(uuid, text, text[], text) TO service_role;

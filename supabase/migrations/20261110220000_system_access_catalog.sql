-- System access catalog: the organisation's systems (Priority, WePlans, drive P …), the
-- resources inside each (environments, projects, folders as a tree) and access groups that
-- bundle resources with a read or write level, mapped to an external group such as an
-- Active Directory group. HR picks groups during onboarding; IT receives a protocol that
-- breaks each group down into its folders.
--
-- company_id on resources and groups is always taken from their system by trigger.
-- Every write is recorded in permission_audit_log with the signed-in actor.

CREATE TABLE IF NOT EXISTS public.system_access_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  -- How access is opened: by hand (and marked done), or automatically through an integration.
  provisioning text NOT NULL DEFAULT 'manual'
    CHECK (provisioning IN ('manual', 'auto_tiful360', 'auto_mesimon')),
  -- Who executes requests for this system: a role, or a specific user when set.
  owner_role public.app_role NOT NULL DEFAULT 'admin',
  owner_user_id uuid,
  -- What a resource is called in this system: environment, folder, project …
  resource_label text NOT NULL DEFAULT 'סביבה',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_access_systems_company_name_key UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS public.system_access_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id uuid NOT NULL REFERENCES public.system_access_systems(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  parent_id uuid REFERENCES public.system_access_resources(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  -- Full path inside the system, segments joined by "\" (a folder path, or just the name).
  path text NOT NULL CHECK (length(path) BETWEEN 1 AND 1000),
  external_ref text,
  is_active boolean NOT NULL DEFAULT true,
  -- Set by a tree import when the resource is no longer in the system; cleared when it returns.
  missing_since timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_access_resources_system_path_key UNIQUE (system_id, path)
);
CREATE INDEX IF NOT EXISTS system_access_resources_parent_idx ON public.system_access_resources(parent_id);

CREATE TABLE IF NOT EXISTS public.system_access_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id uuid NOT NULL REFERENCES public.system_access_systems(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  -- The group IT adds the user to, e.g. an Active Directory group.
  external_name text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_access_groups_system_name_key UNIQUE (system_id, name)
);

CREATE TABLE IF NOT EXISTS public.system_access_group_resources (
  group_id uuid NOT NULL REFERENCES public.system_access_groups(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.system_access_resources(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  level text NOT NULL DEFAULT 'write' CHECK (level IN ('read', 'write')),
  PRIMARY KEY (group_id, resource_id)
);
CREATE INDEX IF NOT EXISTS system_access_group_resources_resource_idx ON public.system_access_group_resources(resource_id);

-- ---------------------------------------------------------------------------------------
-- Company comes from the parent row, never from the client.
CREATE OR REPLACE FUNCTION public.system_access_set_company()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _system_company uuid;
  _parent_system uuid;
BEGIN
  IF TG_TABLE_NAME = 'system_access_group_resources' THEN
    SELECT g.company_id INTO NEW.company_id FROM public.system_access_groups g WHERE g.id = NEW.group_id;
    -- A group may only bundle resources of its own system.
    IF NOT EXISTS (
      SELECT 1 FROM public.system_access_groups g
      JOIN public.system_access_resources r ON r.system_id = g.system_id
      WHERE g.id = NEW.group_id AND r.id = NEW.resource_id
    ) THEN
      RAISE EXCEPTION 'resource and group belong to different systems';
    END IF;
    RETURN NEW;
  END IF;

  SELECT s.company_id INTO _system_company FROM public.system_access_systems s WHERE s.id = NEW.system_id;
  IF _system_company IS NULL THEN
    RAISE EXCEPTION 'system not found';
  END IF;
  NEW.company_id := _system_company;

  -- Nested: PL/pgSQL evaluates both sides of AND, and groups have no parent_id.
  IF TG_TABLE_NAME = 'system_access_resources' THEN
    IF NEW.parent_id IS NOT NULL THEN
      SELECT r.system_id INTO _parent_system FROM public.system_access_resources r WHERE r.id = NEW.parent_id;
      IF _parent_system IS DISTINCT FROM NEW.system_id THEN
        RAISE EXCEPTION 'parent resource belongs to another system';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER system_access_resources_set_company BEFORE INSERT OR UPDATE ON public.system_access_resources
FOR EACH ROW EXECUTE FUNCTION public.system_access_set_company();
CREATE TRIGGER system_access_groups_set_company BEFORE INSERT OR UPDATE ON public.system_access_groups
FOR EACH ROW EXECUTE FUNCTION public.system_access_set_company();
CREATE TRIGGER system_access_group_resources_set_company BEFORE INSERT OR UPDATE ON public.system_access_group_resources
FOR EACH ROW EXECUTE FUNCTION public.system_access_set_company();

CREATE TRIGGER system_access_systems_updated_at BEFORE UPDATE ON public.system_access_systems
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------------------
-- Access rules. Staff who request or execute access read the catalog; admins and IT manage it.
CREATE OR REPLACE FUNCTION public.system_access_can_view(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(auth.uid())
    OR ((public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'it_manager'::app_role)
         OR public.is_operations(auth.uid()) OR public.has_role(auth.uid(), 'hr'::app_role))
        AND _company_id IN (SELECT public.user_company_ids(auth.uid())));
$$;

CREATE OR REPLACE FUNCTION public.system_access_can_manage(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(auth.uid())
    OR ((public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'it_manager'::app_role))
        AND _company_id IN (SELECT public.user_company_ids(auth.uid())));
$$;

DO $$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['system_access_systems', 'system_access_resources', 'system_access_groups', 'system_access_group_resources'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', _t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', _t);
    EXECUTE format('CREATE POLICY "Staff view company system access catalog" ON public.%I FOR SELECT TO authenticated USING (public.system_access_can_view(company_id))', _t);
    EXECUTE format('CREATE POLICY "Admins and IT manage system access catalog" ON public.%I FOR ALL TO authenticated USING (public.system_access_can_manage(company_id)) WITH CHECK (public.system_access_can_manage(company_id))', _t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------
-- Audit: who changed which access definition, with before and after values.
CREATE OR REPLACE FUNCTION public.log_system_access_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  _details text;
BEGIN
  IF _actor IS NULL THEN
    RETURN NULL;
  END IF;
  _details := CASE TG_TABLE_NAME
    WHEN 'system_access_systems' THEN 'מערכת: ' || COALESCE(_row->>'name', '')
    WHEN 'system_access_resources' THEN 'משאב: ' || COALESCE(_row->>'path', '')
    WHEN 'system_access_groups' THEN 'קבוצת גישה: ' || COALESCE(_row->>'name', '')
      || COALESCE(' (' || (_row->>'external_name') || ')', '')
    WHEN 'system_access_grants' THEN 'הרשאה ל' || COALESCE(
      (SELECT name FROM public.system_access_systems WHERE id = NULLIF(_row->>'system_id', '')::uuid), '')
      -- system_access_status_label is defined with the requests (next migration); resolved at run time.
      || ' · ' || COALESCE(public.system_access_status_label(_row->>'status'), '')
    ELSE 'שיוך משאב לקבוצה · ' || COALESCE(_row->>'level', '')
  END;
  INSERT INTO public.permission_audit_log (actor_user_id, target_employee_id, company_id, action, details, before_value, after_value)
  VALUES (
    _actor,
    NULLIF(_row->>'employee_id', '')::uuid,
    NULLIF(_row->>'company_id', '')::uuid,
    TG_TABLE_NAME || '_' || lower(TG_OP),
    _details,
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_system_access_systems AFTER INSERT OR UPDATE OR DELETE ON public.system_access_systems
FOR EACH ROW EXECUTE FUNCTION public.log_system_access_change();
CREATE TRIGGER audit_system_access_groups AFTER INSERT OR UPDATE OR DELETE ON public.system_access_groups
FOR EACH ROW EXECUTE FUNCTION public.log_system_access_change();
CREATE TRIGGER audit_system_access_group_resources AFTER INSERT OR UPDATE OR DELETE ON public.system_access_group_resources
FOR EACH ROW EXECUTE FUNCTION public.log_system_access_change();
-- Resources: renames, (de)activation and deletions are logged per row; an import writes one
-- summary row instead of one per folder (see import_system_access_tree).
CREATE TRIGGER audit_system_access_resources_update AFTER UPDATE ON public.system_access_resources
FOR EACH ROW
WHEN (OLD.name IS DISTINCT FROM NEW.name OR OLD.is_active IS DISTINCT FROM NEW.is_active OR OLD.parent_id IS DISTINCT FROM NEW.parent_id)
EXECUTE FUNCTION public.log_system_access_change();
CREATE TRIGGER audit_system_access_resources_delete AFTER DELETE ON public.system_access_resources
FOR EACH ROW EXECUTE FUNCTION public.log_system_access_change();

-- ---------------------------------------------------------------------------------------
-- Tree import: one transaction per upload. Paths are relative ("פרויקטים\תכנון"); every prefix
-- becomes a node. Resources missing from the upload are flagged, never deleted, so their group
-- assignments stay until someone removes them on purpose.
CREATE OR REPLACE FUNCTION public.import_system_access_tree(_system_id uuid, _paths text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _system public.system_access_systems;
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
  SELECT * INTO _system FROM public.system_access_systems WHERE id = _system_id;
  IF _system.id IS NULL OR NOT public.system_access_can_manage(_system.company_id) THEN
    RAISE EXCEPTION 'not authorized to import into this system';
  END IF;
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
      SELECT id INTO _id FROM public.system_access_resources WHERE system_id = _system_id AND path = _prefix;
      IF _id IS NULL THEN
        INSERT INTO public.system_access_resources (system_id, company_id, parent_id, name, path)
        VALUES (_system_id, _system.company_id, _parent, btrim(_segments[_i]), _prefix)
        RETURNING id INTO _id;
        _added := _added + 1;
      END IF;
      _parent := _id;
    END LOOP;
  END LOOP;

  UPDATE public.system_access_resources
     SET missing_since = NULL
   WHERE system_id = _system_id AND missing_since IS NOT NULL AND path = ANY(_seen);
  GET DIAGNOSTICS _returned = ROW_COUNT;

  UPDATE public.system_access_resources
     SET missing_since = now()
   WHERE system_id = _system_id AND missing_since IS NULL AND NOT (path = ANY(_seen));
  GET DIAGNOSTICS _missing = ROW_COUNT;

  INSERT INTO public.permission_audit_log (actor_user_id, company_id, action, details)
  VALUES (auth.uid(), _system.company_id, 'system_access_tree_import',
          'ייבוא עץ ל' || _system.name || ': ' || _added || ' חדשים, ' || _missing || ' חסרים, ' || _returned || ' חזרו');

  RETURN jsonb_build_object('added', _added, 'missing', _missing, 'returned', _returned,
                            'total', (SELECT count(*) FROM public.system_access_resources WHERE system_id = _system_id));
END;
$$;

REVOKE ALL ON FUNCTION public.import_system_access_tree(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_system_access_tree(uuid, text[]) TO authenticated;

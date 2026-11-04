-- Permission groups: company-scoped groups that grant app roles.
--
-- Every company gets the default groups (one per management role) automatically; a system
-- admin can add custom groups and assign users. Membership is per company, so a user's
-- groups in one company say nothing about another. public.user_roles is kept as the
-- derived union of the user's group roles, so the existing has_role()/is_*() RLS helpers
-- keep working unchanged while groups become the source of truth.
--
-- 'super_admin' (platform) and 'employee' (portal access, granted at sign-up) are not
-- group-managed and are never removed by the sync.

CREATE TABLE IF NOT EXISTS public.permission_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  description text,
  roles public.app_role[] NOT NULL DEFAULT '{}',
  -- Set for the default groups (the role they represent); NULL for custom groups.
  system_key public.app_role,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permission_groups_company_name_key UNIQUE (company_id, name),
  CONSTRAINT permission_groups_company_system_key UNIQUE (company_id, system_key),
  CONSTRAINT permission_groups_no_platform_roles
    CHECK (NOT (roles && ARRAY['super_admin'::public.app_role, 'employee'::public.app_role]))
);

CREATE TABLE IF NOT EXISTS public.permission_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.permission_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Always copied from the group by trigger; never trusted from the client.
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permission_group_members_group_user_key UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS permission_groups_company_idx ON public.permission_groups (company_id);
CREATE INDEX IF NOT EXISTS permission_group_members_user_idx ON public.permission_group_members (user_id, company_id);
CREATE INDEX IF NOT EXISTS permission_group_members_company_idx ON public.permission_group_members (company_id);

ALTER TABLE public.permission_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_group_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permission_groups TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.permission_group_members TO authenticated;
GRANT ALL ON public.permission_groups TO service_role;
GRANT ALL ON public.permission_group_members TO service_role;

-- ------------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------------

-- Roles a non-super-admin may hand out. Mirrors ADMIN_ASSIGNABLE_ROLES in manage-users.
CREATE OR REPLACE FUNCTION public.admin_assignable_roles()
RETURNS public.app_role[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['operations', 'direct_manager', 'finance', 'legal']::public.app_role[]
$$;

-- Who may create/edit/delete groups in a company: super admin, or a system admin of it.
CREATE OR REPLACE FUNCTION public.can_manage_permission_groups(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'admin'::public.app_role)
        AND _company_id IN (SELECT public.user_company_ids(auth.uid())))
$$;

-- Who may add/remove members in a company (same callers manage-users lets change roles).
CREATE OR REPLACE FUNCTION public.can_manage_group_members(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid())
    OR (EXISTS (SELECT 1 FROM public.user_roles
                WHERE user_id = auth.uid()
                  AND role IN ('admin'::public.app_role, 'hr'::public.app_role, 'payroll'::public.app_role))
        AND _company_id IN (SELECT public.user_company_ids(auth.uid())))
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_permission_groups(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_group_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_permission_groups(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_group_members(uuid) TO authenticated, service_role;

-- Recompute a user's group-managed roles in user_roles from their memberships.
CREATE OR REPLACE FUNCTION public.sync_user_roles_from_groups(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _desired public.app_role[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT r), '{}')
    INTO _desired
  FROM public.permission_group_members m
  JOIN public.permission_groups g ON g.id = m.group_id
  CROSS JOIN LATERAL unnest(g.roles) AS r
  WHERE m.user_id = _user_id;

  -- The membership row is the audited change; skip the derived user_roles rows.
  PERFORM set_config('app.permission_sync', 'on', true);

  DELETE FROM public.user_roles
  WHERE user_id = _user_id
    AND role NOT IN ('super_admin'::public.app_role, 'employee'::public.app_role)
    AND NOT (role = ANY (_desired));

  INSERT INTO public.user_roles (user_id, role)
  SELECT _user_id, r FROM unnest(_desired) AS r
  ON CONFLICT (user_id, role) DO NOTHING;

  PERFORM set_config('app.permission_sync', '', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_user_roles_from_groups(uuid) FROM PUBLIC, anon, authenticated;

-- Default groups for one company. Idempotent.
CREATE OR REPLACE FUNCTION public.seed_default_permission_groups(_company_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.permission_groups (company_id, name, description, roles, system_key)
  SELECT _company_id, d.name, d.description, ARRAY[d.role]::public.app_role[], d.role
  FROM (VALUES
    ('admin'::public.app_role,          'מנהלי מערכת',   'ניהול מלא של החברה, ההגדרות והמשתמשים'),
    ('hr'::public.app_role,             'משאבי אנוש',    'עובדים, קליטה, בקשות, נוכחות ושכר'),
    ('payroll'::public.app_role,        'שכר',           'שכר, תלושים, נוכחות ואישור בקשות'),
    ('operations'::public.app_role,     'תפעול',         'עובדים, ציוד, קטגוריות וקליטה'),
    ('it_manager'::public.app_role,     'IT',            'ציוד והרשאות דיגיטליות, קריאות שירות וקליטה'),
    ('finance'::public.app_role,        'כספים',         'עובדים, ציוד, רכב ומנויים'),
    ('legal'::public.app_role,          'משפטי',         'ציוד, מסמכים וקטגוריות'),
    ('direct_manager'::public.app_role, 'מנהלים ישירים', 'אישור בקשות ונוכחות של הכפופים'),
    ('ceo'::public.app_role,            'הנהלה',         'קריאות שירות והודעות לעובדים'),
    ('secretariat'::public.app_role,    'מזכירות',       'קריאות שירות והודעות לעובדים')
  ) AS d(role, name, description)
  ON CONFLICT ON CONSTRAINT permission_groups_company_system_key DO NOTHING;
$$;
REVOKE EXECUTE ON FUNCTION public.seed_default_permission_groups(uuid) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------
-- Guards
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.permission_groups_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _super boolean := _actor IS NOT NULL AND public.is_super_admin(_actor);
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Default groups stay; company deletion (cascade) and service role may remove them.
    IF _actor IS NOT NULL AND NOT _super AND pg_trigger_depth() <= 1 THEN
      IF OLD.system_key IS NOT NULL THEN
        RAISE EXCEPTION 'לא ניתן למחוק קבוצת ברירת מחדל' USING ERRCODE = '42501';
      END IF;
      IF NOT (OLD.roles <@ public.admin_assignable_roles()) THEN
        RAISE EXCEPTION 'רק סופר אדמין יכול למחוק קבוצה עם הרשאות ניהול' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  NEW.name := btrim(NEW.name);
  SELECT COALESCE(array_agg(DISTINCT r ORDER BY r), '{}') INTO NEW.roles FROM unnest(NEW.roles) AS r;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(_actor, NEW.created_by);
    -- Default groups come from seed_default_permission_groups (company trigger / backfill).
    IF NEW.system_key IS NOT NULL AND _actor IS NOT NULL AND NOT _super AND pg_trigger_depth() <= 1 THEN
      RAISE EXCEPTION 'רק המערכת יוצרת קבוצות ברירת מחדל' USING ERRCODE = '42501';
    END IF;
  ELSE
    NEW.updated_at := now();
    IF NEW.company_id <> OLD.company_id OR NEW.system_key IS DISTINCT FROM OLD.system_key THEN
      RAISE EXCEPTION 'לא ניתן להעביר קבוצה בין חברות או לשנות את סוגה' USING ERRCODE = '42501';
    END IF;
    IF OLD.system_key IS NOT NULL AND NEW.roles <> OLD.roles AND _actor IS NOT NULL THEN
      RAISE EXCEPTION 'ההרשאות של קבוצת ברירת מחדל קבועות' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF _actor IS NOT NULL AND NOT _super AND NEW.system_key IS NULL
     AND (NOT (NEW.roles <@ public.admin_assignable_roles())
          OR (TG_OP = 'UPDATE' AND NOT (OLD.roles <@ public.admin_assignable_roles()))) THEN
    RAISE EXCEPTION 'רק סופר אדמין יכול לכלול בקבוצה הרשאות ניהול, שכר, משאבי אנוש או IT'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER permission_groups_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.permission_groups
FOR EACH ROW EXECUTE FUNCTION public.permission_groups_guard();

CREATE OR REPLACE FUNCTION public.permission_group_members_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _row public.permission_group_members := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  _group public.permission_groups;
BEGIN
  SELECT * INTO _group FROM public.permission_groups WHERE id = _row.group_id;

  IF TG_OP = 'INSERT' THEN
    IF _group.id IS NULL THEN
      RAISE EXCEPTION 'הקבוצה לא נמצאה';
    END IF;
    NEW.company_id := _group.company_id;
    NEW.added_by := COALESCE(_actor, NEW.added_by);
    IF NOT EXISTS (SELECT 1 FROM public.user_company_access
                   WHERE user_id = NEW.user_id AND company_id = NEW.company_id) THEN
      RAISE EXCEPTION 'המשתמש אינו משויך לחברה של הקבוצה';
    END IF;
  END IF;

  -- Cascades (group/company/user deletion) and service-role writes skip caller checks.
  IF _actor IS NOT NULL AND pg_trigger_depth() <= 1 AND NOT public.is_super_admin(_actor) THEN
    IF _row.user_id = _actor THEN
      RAISE EXCEPTION 'לא ניתן לשנות את ההרשאות של עצמך' USING ERRCODE = '42501';
    END IF;
    IF _group.id IS NOT NULL AND NOT (_group.roles <@ public.admin_assignable_roles()) THEN
      RAISE EXCEPTION 'רק סופר אדמין יכול לשייך לקבוצה זו' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER permission_group_members_guard
BEFORE INSERT OR DELETE ON public.permission_group_members
FOR EACH ROW EXECUTE FUNCTION public.permission_group_members_guard();

-- ------------------------------------------------------------------
-- Sync triggers
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.permission_group_members_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sync_user_roles_from_groups(CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END);
  RETURN NULL;
END $$;

CREATE TRIGGER permission_group_members_sync
AFTER INSERT OR DELETE ON public.permission_group_members
FOR EACH ROW EXECUTE FUNCTION public.permission_group_members_sync();

CREATE OR REPLACE FUNCTION public.permission_groups_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid;
BEGIN
  IF NEW.roles IS DISTINCT FROM OLD.roles THEN
    FOR _uid IN SELECT DISTINCT user_id FROM public.permission_group_members WHERE group_id = NEW.id LOOP
      PERFORM public.sync_user_roles_from_groups(_uid);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER permission_groups_sync
AFTER UPDATE OF roles ON public.permission_groups
FOR EACH ROW EXECUTE FUNCTION public.permission_groups_sync();

-- Losing access to a company removes its group memberships (and so their roles).
CREATE OR REPLACE FUNCTION public.user_company_access_drop_groups()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.permission_group_members
  WHERE user_id = OLD.user_id AND company_id = OLD.company_id;
  RETURN NULL;
END $$;

CREATE TRIGGER user_company_access_drop_groups
AFTER DELETE ON public.user_company_access
FOR EACH ROW EXECUTE FUNCTION public.user_company_access_drop_groups();

-- New companies start with the default groups.
CREATE OR REPLACE FUNCTION public.companies_seed_permission_groups()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_default_permission_groups(NEW.id);
  RETURN NULL;
END $$;

CREATE TRIGGER companies_seed_permission_groups
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.companies_seed_permission_groups();

-- ------------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------------

CREATE POLICY "Company users view permission groups"
ON public.permission_groups FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Admins create permission groups"
ON public.permission_groups FOR INSERT TO authenticated
WITH CHECK (public.can_manage_permission_groups(company_id));

CREATE POLICY "Admins update permission groups"
ON public.permission_groups FOR UPDATE TO authenticated
USING (public.can_manage_permission_groups(company_id))
WITH CHECK (public.can_manage_permission_groups(company_id));

CREATE POLICY "Admins delete permission groups"
ON public.permission_groups FOR DELETE TO authenticated
USING (public.can_manage_permission_groups(company_id));

CREATE POLICY "View own or managed group memberships"
ON public.permission_group_members FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR (company_id IN (SELECT public.user_company_ids(auth.uid()))
      AND EXISTS (SELECT 1 FROM public.user_roles
                  WHERE user_id = auth.uid()
                    AND role IN ('admin', 'hr', 'payroll', 'operations', 'it_manager')))
);

CREATE POLICY "Managers add group members"
ON public.permission_group_members FOR INSERT TO authenticated
WITH CHECK (public.can_manage_group_members(company_id));

CREATE POLICY "Managers remove group members"
ON public.permission_group_members FOR DELETE TO authenticated
USING (public.can_manage_group_members(company_id));

-- ------------------------------------------------------------------
-- Audit: signed-in writes are logged by trigger; the derived user_roles rows are not.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_permission_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  _details text;
BEGIN
  -- Service-role writes (manage-users) are logged by the function with the real actor.
  IF _actor IS NULL THEN
    RETURN NULL;
  END IF;
  -- user_roles rows derived from a group change: the group change itself is the audit row.
  IF TG_TABLE_NAME = 'user_roles' AND current_setting('app.permission_sync', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME = 'user_roles' THEN
    _details := 'תפקיד: ' || (_row->>'role');
  ELSIF TG_TABLE_NAME = 'user_company_access' THEN
    _details := 'גישה לחברה (תפקיד ' || COALESCE(_row->>'role','') || ')';
  ELSIF TG_TABLE_NAME = 'permission_groups' THEN
    _details := 'קבוצה: ' || COALESCE(_row->>'name','') || ' · הרשאות: '
      || COALESCE((SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(_row->'roles') AS x), '');
  ELSIF TG_TABLE_NAME = 'permission_group_members' THEN
    _details := 'קבוצה: ' || COALESCE(
      (SELECT name FROM public.permission_groups WHERE id = NULLIF(_row->>'group_id','')::uuid), 'נמחקה');
  ELSE
    _details := COALESCE(_row->>'access_type','') || ' · ' || COALESCE(_row->>'resource_path','')
      || ' · ' || COALESCE(_row->>'permission_level','') || ' · ' || COALESCE(_row->>'status','');
  END IF;
  INSERT INTO public.permission_audit_log
    (actor_user_id, target_user_id, target_employee_id, company_id, action, details, before_value, after_value)
  VALUES (
    _actor,
    NULLIF(_row->>'user_id','')::uuid,
    NULLIF(_row->>'employee_id','')::uuid,
    NULLIF(_row->>'company_id','')::uuid,
    TG_TABLE_NAME || '_' || lower(TG_OP), _details,
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
  );
  RETURN NULL;
END $$;

CREATE TRIGGER audit_permission_groups AFTER INSERT OR UPDATE OR DELETE ON public.permission_groups
FOR EACH ROW EXECUTE FUNCTION public.log_permission_change();
CREATE TRIGGER audit_permission_group_members AFTER INSERT OR DELETE ON public.permission_group_members
FOR EACH ROW EXECUTE FUNCTION public.log_permission_change();

-- ------------------------------------------------------------------
-- Backfill: default groups for every company, and today's roles as memberships in every
-- company the user can access — so nobody gains or loses access on deploy.
-- ------------------------------------------------------------------

SELECT public.seed_default_permission_groups(c.id) FROM public.companies c;

INSERT INTO public.permission_group_members (group_id, user_id, company_id)
SELECT g.id, ur.user_id, uca.company_id
FROM public.user_roles ur
JOIN public.user_company_access uca ON uca.user_id = ur.user_id
JOIN public.permission_groups g ON g.company_id = uca.company_id AND g.system_key = ur.role
WHERE ur.role NOT IN ('super_admin', 'employee')
ON CONFLICT ON CONSTRAINT permission_group_members_group_user_key DO NOTHING;

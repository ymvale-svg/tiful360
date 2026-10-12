CREATE TABLE public.permission_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  target_user_id uuid,
  target_employee_id uuid,
  company_id uuid,
  action text NOT NULL,
  details text,
  before_value jsonb,
  after_value jsonb
);
GRANT SELECT ON public.permission_audit_log TO authenticated;
GRANT ALL ON public.permission_audit_log TO service_role;
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX permission_audit_log_created_idx ON public.permission_audit_log (created_at DESC);

CREATE POLICY "Admins view permission audit"
ON public.permission_audit_log FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::app_role)
      AND (company_id IS NULL OR company_id IN (SELECT public.user_company_ids(auth.uid()))))
);

CREATE OR REPLACE FUNCTION public.permission_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'permission_audit_log is append-only';
END $$;
CREATE TRIGGER permission_audit_no_update BEFORE UPDATE OR DELETE ON public.permission_audit_log
FOR EACH ROW EXECUTE FUNCTION public.permission_audit_immutable();

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
  IF TG_TABLE_NAME = 'user_roles' THEN
    _details := 'תפקיד: ' || (_row->>'role');
  ELSIF TG_TABLE_NAME = 'user_company_access' THEN
    _details := 'גישה לחברה (תפקיד ' || COALESCE(_row->>'role','') || ')';
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

CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.log_permission_change();
CREATE TRIGGER audit_user_company_access AFTER INSERT OR UPDATE OR DELETE ON public.user_company_access
FOR EACH ROW EXECUTE FUNCTION public.log_permission_change();
CREATE TRIGGER audit_digital_access AFTER INSERT OR UPDATE OR DELETE ON public.digital_access
FOR EACH ROW EXECUTE FUNCTION public.log_permission_change();

CREATE OR REPLACE FUNCTION public.can_view_permission_audit(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND _company_id IN (SELECT public.user_company_ids(auth.uid())));
$$;

-- Log rows with readable names, scoped to a company (company rows + rows about its users).
CREATE OR REPLACE FUNCTION public.get_permission_audit(_company_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(id uuid, created_at timestamptz, actor_email text, actor_name text, target_email text, target_name text, action text, details text, company_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.created_at, au.email::text, ap.display_name,
    COALESCE(tu.email::text, te.email), COALESCE(te.full_name, tp.display_name),
    l.action, l.details, l.company_id
  FROM public.permission_audit_log l
  LEFT JOIN auth.users au ON au.id = l.actor_user_id
  LEFT JOIN public.profiles ap ON ap.user_id = l.actor_user_id
  LEFT JOIN auth.users tu ON tu.id = l.target_user_id
  LEFT JOIN public.profiles tp ON tp.user_id = l.target_user_id
  LEFT JOIN public.employees te ON te.id = l.target_employee_id
  WHERE public.can_view_permission_audit(_company_id)
    AND l.created_at >= _from AND l.created_at < _to
    AND (l.company_id = _company_id
         OR (l.company_id IS NULL AND l.target_user_id IN
             (SELECT uca.user_id FROM public.user_company_access uca WHERE uca.company_id = _company_id)))
  ORDER BY l.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_permissions_snapshot(_company_id uuid)
RETURNS TABLE(user_id uuid, email text, full_name text, roles text, company_role text, banned boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT uca.user_id, u.email::text, COALESCE(e.full_name, p.display_name),
    (SELECT string_agg(r.role::text, ', ' ORDER BY r.role::text) FROM public.user_roles r WHERE r.user_id = uca.user_id),
    uca.role::text,
    COALESCE(u.banned_until > now(), false)
  FROM public.user_company_access uca
  LEFT JOIN auth.users u ON u.id = uca.user_id
  LEFT JOIN public.profiles p ON p.user_id = uca.user_id
  LEFT JOIN LATERAL (SELECT full_name FROM public.employees WHERE linked_user_id = uca.user_id AND company_id = _company_id LIMIT 1) e ON true
  WHERE uca.company_id = _company_id AND public.can_view_permission_audit(_company_id)
  ORDER BY 3;
$$;
GRANT EXECUTE ON FUNCTION public.get_permission_audit(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_permissions_snapshot(uuid) TO authenticated;

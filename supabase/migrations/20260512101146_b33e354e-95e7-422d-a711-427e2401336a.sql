
CREATE TABLE IF NOT EXISTS public.attendance_agent_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  device_key text NOT NULL DEFAULT 'default',
  agent_version text,
  clock_ip text,
  clock_reachable boolean,
  last_error text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, device_key)
);

ALTER TABLE public.attendance_agent_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can read heartbeats" ON public.attendance_agent_heartbeats;
CREATE POLICY "Company members can read heartbeats"
ON public.attendance_agent_heartbeats
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR company_id IN (SELECT public.user_company_ids(auth.uid()))
);

CREATE INDEX IF NOT EXISTS idx_agent_hb_company_seen
  ON public.attendance_agent_heartbeats (company_id, last_seen_at DESC);

DROP TRIGGER IF EXISTS trg_agent_hb_updated_at ON public.attendance_agent_heartbeats;
CREATE TRIGGER trg_agent_hb_updated_at
BEFORE UPDATE ON public.attendance_agent_heartbeats
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_attendance_agent_status(_company_id uuid)
RETURNS TABLE(
  device_key text,
  agent_version text,
  clock_ip text,
  clock_reachable boolean,
  last_error text,
  last_seen_at timestamptz,
  last_success_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT device_key, agent_version, clock_ip, clock_reachable,
         last_error, last_seen_at, last_success_at
  FROM public.attendance_agent_heartbeats
  WHERE company_id = _company_id
    AND (
      public.is_super_admin(auth.uid())
      OR _company_id IN (SELECT public.user_company_ids(auth.uid()))
    )
  ORDER BY last_seen_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_attendance_agent_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attendance_agent_status(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.find_birthdays_by_range(
  _company_id uuid,
  _from_month int,
  _from_day int,
  _to_month int,
  _to_day int
)
RETURNS TABLE(
  id uuid,
  full_name text,
  employee_code text,
  department text,
  role text,
  birth_date date,
  birth_month int,
  birth_day int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH e AS (
    SELECT
      x.id, x.full_name, x.employee_code, x.department, x.role, x.birth_date,
      EXTRACT(MONTH FROM x.birth_date)::int AS m,
      EXTRACT(DAY   FROM x.birth_date)::int AS d
    FROM public.employees x
    WHERE x.company_id = _company_id
      AND x.status = 'active'
      AND x.birth_date IS NOT NULL
      AND (
        public.is_super_admin(auth.uid())
        OR x.company_id IN (SELECT public.user_company_ids(auth.uid()))
      )
  )
  SELECT id, full_name, employee_code, department, role, birth_date, m, d
  FROM e
  WHERE
    CASE
      WHEN (_from_month, _from_day) <= (_to_month, _to_day)
        THEN (m, d) BETWEEN (_from_month, _from_day) AND (_to_month, _to_day)
      ELSE
        (m, d) >= (_from_month, _from_day) OR (m, d) <= (_to_month, _to_day)
    END
  ORDER BY m, d, full_name;
$$;

REVOKE EXECUTE ON FUNCTION public.find_birthdays_by_range(uuid,int,int,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_birthdays_by_range(uuid,int,int,int,int) TO authenticated, service_role;

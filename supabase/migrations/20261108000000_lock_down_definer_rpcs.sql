-- Security: two SECURITY DEFINER functions were callable without a company check.
--
-- 1. get_daily_missing_punches(date) returns names, emails and punch times of
--    employees in every company. Only the cron edge functions call it, with the
--    service role. It was never revoked from PUBLIC/anon/authenticated, so the
--    public anon key could call it through /rest/v1/rpc.
--    (appsec:definer-rpc-missing-punches-all-tenants-anon)
REVOKE EXECUTE ON FUNCTION public.get_daily_missing_punches(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_missing_punches(date) TO service_role;

-- 2. get_company_birthdays(uuid) returns names and full birth dates for any
--    company id. Migration 20260604081349 dropped and recreated it, which lost the
--    earlier REVOKE from anon. Same body, plus the company-access check used by
--    find_birthdays_by_range. (appsec:definer-rpc-birthdays-no-company-check)
CREATE OR REPLACE FUNCTION public.get_company_birthdays(_company_id uuid)
RETURNS TABLE(
  id uuid,
  full_name text,
  birth_date date,
  birthday_calendar_preference public.birthday_calendar_pref,
  hebrew_birth_day smallint,
  hebrew_birth_month smallint,
  hebrew_birth_year smallint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT e.id, e.full_name, e.birth_date,
         e.birthday_calendar_preference,
         e.hebrew_birth_day, e.hebrew_birth_month, e.hebrew_birth_year
  FROM public.employees e
  WHERE e.company_id = _company_id
    AND e.status = 'active'
    AND (
      public.is_super_admin(auth.uid())
      OR e.company_id IN (SELECT public.user_company_ids(auth.uid()))
    )
    AND (
      (e.birthday_calendar_preference = 'gregorian' AND e.birth_date IS NOT NULL)
      OR (e.birthday_calendar_preference = 'hebrew'
          AND e.hebrew_birth_day IS NOT NULL
          AND e.hebrew_birth_month IS NOT NULL)
    )
$function$;

REVOKE EXECUTE ON FUNCTION public.get_company_birthdays(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_birthdays(uuid) TO authenticated, service_role;

-- Security: restate the EXECUTE grants on the attendance RPCs that 0051 redefined.
-- 0051 used CREATE OR REPLACE with the same signatures, so the REVOKE from
-- supabase/migrations/20261108000000_lock_down_definer_rpcs.sql still holds today.
-- This makes it explicit, so a later DROP + CREATE or a database built from drizzle alone
-- does not reopen these SECURITY DEFINER functions to anon.
-- Idempotent: it does not change behaviour on a database where the lock-down already ran.

-- Returns names, emails and punch times of every company, with no auth check:
-- only the scheduled job (service_role) may call it.
REVOKE EXECUTE ON FUNCTION public.get_daily_missing_punches(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_missing_punches(date) TO service_role;

-- Checks the caller's role and company itself; the dashboard card calls it as a signed-in user.
REVOKE EXECUTE ON FUNCTION public.get_attendance_gaps(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attendance_gaps(uuid, date, date) TO authenticated, service_role;

-- Security / privacy fix (security-guard 2026-11-22, issue #64):
-- appsec:open-api-unauth-log-flood-no-retention, privacy:api-request-log-undeletable-no-retention
--
-- api_request_log was fully append-only: the trigger refused DELETE even for
-- service_role, so old rows (IP addresses, error texts) could never be removed.
-- Now service_role may delete rows that are older than 24 months, the minimum that
-- regulation 10 (תקנות הגנת הפרטיות (אבטחת מידע)) requires access records to be kept.
-- The actual retention period is decided by the owner with the privacy officer; a
-- scheduled cleanup is set up separately. Updates stay blocked for everyone, and
-- nobody else may delete.
CREATE OR REPLACE FUNCTION public.api_request_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_user = 'service_role' AND OLD.created_at < now() - interval '24 months' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'api_request_log is append-only: rows cannot be changed, and only service_role may remove rows older than 24 months';
END $$;

COMMENT ON TABLE public.api_request_log IS 'יומן קריאות מהממשק החיצוני. אין עדכון; service_role בלבד רשאי למחוק שורות בנות יותר מ-24 חודשים';

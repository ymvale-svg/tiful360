-- Security fix (security-guard 2026-11-22, issue #64):
-- appsec:open-api-select-star-personal-data
--
-- A key with "read" alone used to get every employee's ID number, birth date, full
-- address, family status and health fund, and could search/filter by ID number.
-- These details now need a separate permission, "identity" (פרטים מזהים).
-- Existing keys do not get it automatically: grant it in the keys screen only to a
-- key that really needs ID data.
ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_scopes_allowed;
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_scopes_allowed
  CHECK (scopes <@ ARRAY['read','write','delete','payroll','identity']::text[] AND array_length(scopes, 1) > 0);

COMMENT ON COLUMN public.api_keys.scopes IS 'היקף הפעולות: read, write, delete, payroll, identity (פרטים מזהים של עובדים)';

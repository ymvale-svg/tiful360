\set ON_ERROR_STOP 1
-- a1 admin (hub manager) · a3 HR · a4 IT
INSERT INTO companies(id,name) VALUES ('00000000-0000-0000-0000-0000000000c1','A');
INSERT INTO profiles VALUES ('00000000-0000-0000-0000-0000000000a1','מנהל ההרשאות'),('00000000-0000-0000-0000-0000000000a3','דנה'),('00000000-0000-0000-0000-0000000000a4','איש IT');
INSERT INTO user_roles VALUES ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000a3','hr'),('00000000-0000-0000-0000-0000000000a4','it_manager');
INSERT INTO user_company_access SELECT u, '00000000-0000-0000-0000-0000000000c1' FROM unnest(ARRAY['00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a4']::uuid[]) u;
INSERT INTO employees(id,company_id,full_name,start_date,status) VALUES
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1','אחמד פוקרה', current_date - 30,'active'),
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c1','בלי הרשאות', current_date - 30,'active');
INSERT INTO system_access_systems(id,company_id,name,owner_role) VALUES
  ('00000000-0000-0000-0000-0000000005a1','00000000-0000-0000-0000-0000000000c1','כונן P','it_manager'),
  ('00000000-0000-0000-0000-0000000005a2','00000000-0000-0000-0000-0000000000c1','פריוריטי','admin');
GRANT SELECT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.expect_error(_sql text, _like text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RAISE EXCEPTION 'FAIL: expected error like % for %', _like, _sql;
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
  IF SQLERRM NOT LIKE _like THEN RAISE EXCEPTION 'FAIL: got "%" expected like "%"', SQLERRM, _like; END IF;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.check(_ok boolean, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF _ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', _what; END IF; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text, text), pg_temp.check(boolean, text) TO authenticated;

SET ROLE authenticated;
-- Access opened: drive P (by IT) and Priority (by the manager)
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a3',false);
SELECT request_system_access('00000000-0000-0000-0000-0000000000e1', '[{"system_id":"00000000-0000-0000-0000-0000000005a1"},{"system_id":"00000000-0000-0000-0000-0000000005a2"}]');
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
SELECT resolve_system_access_grant(id, 'done', NULL, 'ahmad.f') FROM system_access_grants;
SELECT pg_temp.check((SELECT count(*) FROM system_access_grants WHERE status = 'active') = 2, 'both open');

-- Nothing to revoke for an employee without access
SELECT pg_temp.expect_error($$SELECT request_system_access_revocation('00000000-0000-0000-0000-0000000000e2')$$, 'no active access%');

-- HR starts the offboarding: status 'leaving' → one revoke request, due on the last day 17:00
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a3',false);
RESET ROLE;  -- start_employee_offboarding runs as definer; emulate its update with the HR actor
UPDATE employees SET status = 'leaving', end_date = current_date + 3 WHERE id = '00000000-0000-0000-0000-0000000000e1';
SET ROLE authenticated;
SELECT pg_temp.check((SELECT count(*) FROM system_access_requests WHERE kind = 'revoke' AND requested_by_name = 'דנה') = 1, 'revoke request by the HR actor');
SELECT pg_temp.check((SELECT count(*) FROM system_access_grants WHERE status = 'revoke_requested' AND revoke_due_at = ((current_date + 3) + time '17:00') AT TIME ZONE 'Asia/Jerusalem') = 2, 'grants due on the last day 17:00');
SELECT pg_temp.check((SELECT t.title LIKE 'ניתוק הרשאות%' AND t.priority = 'high' AND jsonb_array_length(t.checklist) = 2 FROM it_tickets t JOIN system_access_requests r ON r.hub_ticket_id = t.id WHERE r.kind = 'revoke'), 'revoke hub ticket');
-- Still "has access" while pending: cannot be requested again
SELECT pg_temp.expect_error($$SELECT request_system_access('00000000-0000-0000-0000-0000000000e1', '[{"system_id":"00000000-0000-0000-0000-0000000005a1"}]')$$, 'the employee already has%');

-- Manager: revocations cannot be rejected; drive P goes to IT, Priority he revokes himself
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
SELECT pg_temp.expect_error($$SELECT resolve_system_access_grant((SELECT id FROM system_access_grants WHERE system_id = '00000000-0000-0000-0000-0000000005a2'), 'reject', NULL, NULL, 'x')$$, 'a revocation cannot be rejected%');
SELECT resolve_system_access_grant((SELECT id FROM system_access_grants WHERE system_id = '00000000-0000-0000-0000-0000000005a2'), 'done', now() - interval '1 hour');
SELECT pg_temp.check((SELECT status = 'revoked' AND revoked_by_name = 'מנהל ההרשאות' AND executed_by_name = 'מנהל ההרשאות' AND revoked_at < now() FROM system_access_grants WHERE system_id = '00000000-0000-0000-0000-0000000005a2'), 'revoked with history kept');
SELECT dispatch_system_access(ARRAY(SELECT id FROM system_access_grants WHERE system_id = '00000000-0000-0000-0000-0000000005a1'));
SELECT pg_temp.check((SELECT t.title LIKE 'ניתוק הרשאות%' AND t.description LIKE '%ahmad.f%' FROM it_tickets t JOIN system_access_grants g ON g.revoke_dispatch_ticket_id = t.id), 'owner revoke ticket names the user to disable');
SELECT pg_temp.check((SELECT dispatch_ticket_id IS NULL FROM system_access_grants WHERE system_id = '00000000-0000-0000-0000-0000000005a1'), 'grant dispatch ticket untouched (none)');

-- IT ticks the line in its ticket → revoked; request and both tickets close
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a4',false);
UPDATE it_tickets t SET checklist = (SELECT jsonb_agg(jsonb_set(c, '{done}', 'true')) FROM jsonb_array_elements(t.checklist) c)
 WHERE t.id = (SELECT revoke_dispatch_ticket_id FROM system_access_grants WHERE system_id = '00000000-0000-0000-0000-0000000005a1');
SELECT pg_temp.check((SELECT status = 'revoked' AND revoked_by_name = 'איש IT' FROM system_access_grants WHERE system_id = '00000000-0000-0000-0000-0000000005a1'), 'IT revoked from the ticket');
SELECT pg_temp.check((SELECT status FROM system_access_requests WHERE kind = 'revoke') = 'done', 'revoke request done');
SELECT pg_temp.check((SELECT bool_and(t.status = 'done') FROM it_tickets t WHERE t.title LIKE 'ניתוק הרשאות%'), 'revoke tickets closed');
-- The original grant request stays done
SELECT pg_temp.check((SELECT status FROM system_access_requests WHERE kind = 'grant') = 'done', 'grant request untouched');

-- Cancelling an offboarding cancels pending revocations
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
SELECT request_system_access('00000000-0000-0000-0000-0000000000e2', '[{"system_id":"00000000-0000-0000-0000-0000000005a2"}]');
SELECT resolve_system_access_grant(id, 'done') FROM system_access_grants WHERE employee_id = '00000000-0000-0000-0000-0000000000e2';
RESET ROLE;
UPDATE employees SET status = 'leaving' WHERE id = '00000000-0000-0000-0000-0000000000e2';
UPDATE employees SET status = 'active' WHERE id = '00000000-0000-0000-0000-0000000000e2';
SELECT pg_temp.check((SELECT status = 'active' AND revoke_note LIKE 'הניתוק בוטל%' FROM system_access_grants WHERE employee_id = '00000000-0000-0000-0000-0000000000e2'), 'cancel restores access');
SELECT pg_temp.check((SELECT status FROM system_access_requests WHERE kind = 'revoke' AND employee_id = '00000000-0000-0000-0000-0000000000e2') = 'done', 'cancelled revoke request closed');
SELECT pg_temp.check((SELECT c->>'label' LIKE '%הניתוק בוטל%' FROM it_tickets t JOIN system_access_requests r ON r.hub_ticket_id = t.id, jsonb_array_elements(t.checklist) c
  WHERE r.kind = 'revoke' AND r.employee_id = '00000000-0000-0000-0000-0000000000e2'), 'hub ticket says cancelled');
SELECT 'revocation: all assertions passed' AS result;

\set ON_ERROR_STOP 1
-- a1 admin of A · a3 HR of A · a2 admin of B
INSERT INTO companies(id,name) VALUES ('00000000-0000-0000-0000-0000000000c1','A'),('00000000-0000-0000-0000-0000000000c2','B');
INSERT INTO profiles VALUES ('00000000-0000-0000-0000-0000000000a1','מנהל ההרשאות'),('00000000-0000-0000-0000-0000000000a3','דנה');
INSERT INTO user_roles VALUES ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000a3','hr'),('00000000-0000-0000-0000-0000000000a2','admin');
INSERT INTO user_company_access VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c2');
INSERT INTO employees(id,company_id,full_name,start_date,status) VALUES
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1','ותיק','2020-01-05','active'),
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c1','בקליטה ישנה','2026-10-04','onboarding'),
  ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c1','בלי תאריך',NULL,'active'),
  ('00000000-0000-0000-0000-0000000000e9','00000000-0000-0000-0000-0000000000c2','של B','2020-01-01','onboarding');
INSERT INTO system_access_systems(id,company_id,name) VALUES
  ('00000000-0000-0000-0000-0000000005a1','00000000-0000-0000-0000-0000000000c1','פריוריטי'),
  ('00000000-0000-0000-0000-0000000005b1','00000000-0000-0000-0000-0000000000c2','של B');
INSERT INTO system_access_groups(id,system_id,name) VALUES ('00000000-0000-0000-0000-00000000aa01','00000000-0000-0000-0000-0000000005a1','כספים');
INSERT INTO it_tickets(id,company_id,status) VALUES
  ('00000000-0000-0000-0000-0000000007a1','00000000-0000-0000-0000-0000000000c1','open'),
  ('00000000-0000-0000-0000-0000000007a2','00000000-0000-0000-0000-0000000000c1','open');
INSERT INTO onboarding_processes(id,company_id,employee_id,status,it_ticket_id) VALUES
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e2','sent','00000000-0000-0000-0000-0000000007a1'),
  ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e1','done',NULL),
  ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e3','draft','00000000-0000-0000-0000-0000000007a2'),
  ('00000000-0000-0000-0000-0000000000f9','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000e9','sent',NULL);
INSERT INTO onboarding_items(process_id,title,status) VALUES
  ('00000000-0000-0000-0000-0000000000f1','מחשב','done'),('00000000-0000-0000-0000-0000000000f1','טלפון','pending');
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
-- 1. Direct assignment: only the company's own admin
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a3',false);
SELECT pg_temp.expect_error($$SELECT assign_system_access_direct('00000000-0000-0000-0000-0000000000c1', '[{"employee_id":"00000000-0000-0000-0000-0000000000e1","system_id":"00000000-0000-0000-0000-0000000005a1"}]')$$, 'not authorized%');
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a2',false);
SELECT pg_temp.expect_error($$SELECT assign_system_access_direct('00000000-0000-0000-0000-0000000000c1', '[{"employee_id":"00000000-0000-0000-0000-0000000000e1","system_id":"00000000-0000-0000-0000-0000000005a1"}]')$$, 'not authorized%');
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
-- Another company's employee or system is refused, and nothing of the batch is written
SELECT pg_temp.expect_error($$SELECT assign_system_access_direct('00000000-0000-0000-0000-0000000000c1', '[{"employee_id":"00000000-0000-0000-0000-0000000000e1","system_id":"00000000-0000-0000-0000-0000000005a1"},{"employee_id":"00000000-0000-0000-0000-0000000000e9","system_id":"00000000-0000-0000-0000-0000000005a1"}]')$$, 'employee not found%');
SELECT pg_temp.expect_error($$SELECT assign_system_access_direct('00000000-0000-0000-0000-0000000000c1', '[{"employee_id":"00000000-0000-0000-0000-0000000000e1","system_id":"00000000-0000-0000-0000-0000000005b1"}]')$$, 'system not found%');
SELECT pg_temp.check((SELECT count(*) FROM system_access_grants) = 0, 'failed batch wrote nothing');

SELECT assign_system_access_direct('00000000-0000-0000-0000-0000000000c1', '[
  {"employee_id":"00000000-0000-0000-0000-0000000000e1","system_id":"00000000-0000-0000-0000-0000000005a1","external_username":"vatik"},
  {"employee_id":"00000000-0000-0000-0000-0000000000e1","system_id":"00000000-0000-0000-0000-0000000005a1","group_id":"00000000-0000-0000-0000-00000000aa01"},
  {"employee_id":"00000000-0000-0000-0000-0000000000e2","system_id":"00000000-0000-0000-0000-0000000005a1","effective_date":"2025-07-01"},
  {"employee_id":"00000000-0000-0000-0000-0000000000e3","system_id":"00000000-0000-0000-0000-0000000005a1"}
]') AS r1 \gset
SELECT pg_temp.check((:'r1'::jsonb->>'grants')::int = 4 AND (:'r1'::jsonb->>'employees')::int = 3 AND (:'r1'::jsonb->>'skipped')::int = 0, 'four grants for three employees');
SELECT pg_temp.check((SELECT bool_and(status = 'active' AND executed_by = '00000000-0000-0000-0000-0000000000a1' AND executed_by_name = 'מנהל ההרשאות') FROM system_access_grants), 'active at once, by the admin');
SELECT pg_temp.check((SELECT count(*) FROM system_access_requests WHERE status = 'done' AND hub_ticket_id IS NULL) = 3, 'one completed request per employee, no ticket');
SELECT pg_temp.check((SELECT count(*) FROM it_tickets) = 2, 'no new tickets');
SELECT pg_temp.check((SELECT effective_from FROM system_access_grants WHERE employee_id = '00000000-0000-0000-0000-0000000000e1' AND group_id IS NULL) = timestamptz '2020-01-05 08:00 Asia/Jerusalem', 'default: first day 08:00 Israel time');
SELECT pg_temp.check((SELECT effective_from FROM system_access_grants WHERE employee_id = '00000000-0000-0000-0000-0000000000e2') = timestamptz '2025-07-01 08:00 Asia/Jerusalem', 'given day at 08:00 (summer time)');
SELECT pg_temp.check((SELECT effective_from FROM system_access_grants WHERE employee_id = '00000000-0000-0000-0000-0000000000e3') <= now(), 'no start date: now');
SELECT pg_temp.check((SELECT external_username FROM system_access_grants WHERE employee_id = '00000000-0000-0000-0000-0000000000e1' AND group_id IS NULL) = 'vatik', 'username kept');
-- Held access is skipped on a second run
SELECT assign_system_access_direct('00000000-0000-0000-0000-0000000000c1', '[{"employee_id":"00000000-0000-0000-0000-0000000000e1","system_id":"00000000-0000-0000-0000-0000000005a1"}]') AS r2 \gset
SELECT pg_temp.check((:'r2'::jsonb->>'grants')::int = 0 AND (:'r2'::jsonb->>'skipped')::int = 1, 'held access skipped');
SELECT pg_temp.check((SELECT count(*) FROM permission_audit_log WHERE action = 'system_access_direct_assign' AND actor_user_id = '00000000-0000-0000-0000-0000000000a1') = 1, 'one summary audit row (none for an all-skipped run)');

-- 2. Deleting onboarding processes: only the company's own admin
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a3',false);
SELECT pg_temp.expect_error($$SELECT delete_onboarding_processes('00000000-0000-0000-0000-0000000000c1', ARRAY['00000000-0000-0000-0000-0000000000f1']::uuid[])$$, 'not authorized%');
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a2',false);
SELECT pg_temp.expect_error($$SELECT delete_onboarding_processes('00000000-0000-0000-0000-0000000000c1', ARRAY['00000000-0000-0000-0000-0000000000f1']::uuid[])$$, 'not authorized%');
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
-- Another company's process is never touched, even when its id is passed
SELECT pg_temp.expect_error($$SELECT delete_onboarding_processes('00000000-0000-0000-0000-0000000000c1', ARRAY['00000000-0000-0000-0000-0000000000f9']::uuid[])$$, 'no onboarding processes found%');
SELECT delete_onboarding_processes('00000000-0000-0000-0000-0000000000c1', ARRAY[
  '00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000f9']::uuid[]) AS d \gset
SELECT pg_temp.check((:'d'::jsonb->>'deleted')::int = 2 AND (:'d'::jsonb->>'ticketsClosed')::int = 1 AND (:'d'::jsonb->>'employeesActivated')::int = 1, 'two deleted, one ticket closed, one employee activated');
RESET ROLE;
SELECT pg_temp.check((SELECT count(*) FROM onboarding_processes) = 2, 'B process and the unselected draft remain');
SELECT pg_temp.check((SELECT count(*) FROM onboarding_items) = 0, 'items (also done ones) removed with their process');
SELECT pg_temp.check((SELECT status FROM it_tickets WHERE id = '00000000-0000-0000-0000-0000000007a1') = 'done', 'onboarding ticket closed');
SELECT pg_temp.check((SELECT status FROM it_tickets WHERE id = '00000000-0000-0000-0000-0000000007a2') = 'open', 'ticket of a kept process untouched');
SELECT pg_temp.check((SELECT status FROM employees WHERE id = '00000000-0000-0000-0000-0000000000e2') = 'active', 'employee no longer onboarding is active');
SELECT pg_temp.check((SELECT status FROM employees WHERE id = '00000000-0000-0000-0000-0000000000e9') = 'onboarding', 'other company untouched');
SELECT pg_temp.check((SELECT count(*) FROM system_access_grants WHERE employee_id = '00000000-0000-0000-0000-0000000000e2') = 1, 'access kept');
SELECT pg_temp.check((SELECT count(*) FROM permission_audit_log WHERE action = 'onboarding_processes_deleted' AND actor_user_id = '00000000-0000-0000-0000-0000000000a1' AND company_id = '00000000-0000-0000-0000-0000000000c1') = 1, 'deletion audited');
SELECT 'direct assign and onboarding delete: all assertions passed' AS result;

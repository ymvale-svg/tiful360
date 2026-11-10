\set ON_ERROR_STOP 1
-- a1 admin (hub manager) · a3 HR · a4 IT · a5 operations · a2 admin of another company
INSERT INTO companies(id,name) VALUES ('00000000-0000-0000-0000-0000000000c1','A'),('00000000-0000-0000-0000-0000000000c2','B');
INSERT INTO profiles VALUES ('00000000-0000-0000-0000-0000000000a1','מנהל ההרשאות'),('00000000-0000-0000-0000-0000000000a3','דנה'),('00000000-0000-0000-0000-0000000000a4','איש IT');
INSERT INTO user_roles VALUES ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000a2','admin'),
  ('00000000-0000-0000-0000-0000000000a3','hr'),('00000000-0000-0000-0000-0000000000a4','it_manager'),('00000000-0000-0000-0000-0000000000a5','operations');
INSERT INTO user_company_access VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c2'),('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000c1');
INSERT INTO employees(id,company_id,full_name,role,department,start_date,status,employee_code) VALUES
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1','אחמד פוקרה','מהנדס ביצוע','הנדסה', current_date + 7,'onboarding','E-1');
INSERT INTO system_access_systems(id,company_id,name,owner_role,resource_label) VALUES
  ('00000000-0000-0000-0000-0000000005a1','00000000-0000-0000-0000-0000000000c1','כונן P','it_manager','תיקייה'),
  ('00000000-0000-0000-0000-0000000005a2','00000000-0000-0000-0000-0000000000c1','פריוריטי','admin','סביבה'),
  ('00000000-0000-0000-0000-0000000005b1','00000000-0000-0000-0000-0000000000c2','של חברה אחרת','admin','סביבה');
INSERT INTO system_access_groups(id,system_id,company_id,name,external_name) VALUES
  ('00000000-0000-0000-0000-0000000006a1','00000000-0000-0000-0000-0000000005a1','00000000-0000-0000-0000-0000000000c1','הנדסה','GRP_P_Engineering');
INSERT INTO system_access_resources(id,system_id,company_id,name,path) VALUES
  ('00000000-0000-0000-0000-0000000007a1','00000000-0000-0000-0000-0000000005a2','00000000-0000-0000-0000-0000000000c1','כספים','כספים'),
  ('00000000-0000-0000-0000-0000000007a2','00000000-0000-0000-0000-0000000005a2','00000000-0000-0000-0000-0000000000c1','רכש','רכש');
INSERT INTO onboarding_processes(id,company_id,employee_id,status) VALUES ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e1','sent');
GRANT SELECT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(_sql text, _like text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RAISE EXCEPTION 'FAIL: expected error like % for %', _like, _sql;
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
  IF SQLERRM NOT LIKE _like THEN RAISE EXCEPTION 'FAIL: got "%" expected like "%"', SQLERRM, _like; END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text, text) TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.check(_ok boolean, _what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF _ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', _what; END IF; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.check(boolean, text) TO authenticated;

SET ROLE authenticated;

-- Grants are read-only to clients
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
SELECT pg_temp.expect_error($$INSERT INTO system_access_grants(company_id) VALUES ('00000000-0000-0000-0000-0000000000c1')$$, '%permission denied%');

-- HR requests drive P (group) + Priority (two environments) from the onboarding process
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a3',false);
SELECT pg_temp.expect_error($$SELECT request_system_access('00000000-0000-0000-0000-0000000000e1', '[{"system_id":"00000000-0000-0000-0000-0000000005b1"}]')$$, 'system not found%');
SELECT pg_temp.expect_error($$SELECT request_system_access('00000000-0000-0000-0000-0000000000e1', '[]')$$, 'choose at least one system%');
SELECT request_system_access('00000000-0000-0000-0000-0000000000e1', '[
  {"system_id":"00000000-0000-0000-0000-0000000005a1","group_id":"00000000-0000-0000-0000-0000000006a1"},
  {"system_id":"00000000-0000-0000-0000-0000000005a2","resource_id":"00000000-0000-0000-0000-0000000007a1"},
  {"system_id":"00000000-0000-0000-0000-0000000005a2","resource_id":"00000000-0000-0000-0000-0000000007a2","effective_from":"2026-12-01T10:00:00+02:00"}
]', '00000000-0000-0000-0000-0000000000f1', 'עובד חדש') AS request;
SELECT pg_temp.check((SELECT count(*) FROM system_access_grants) = 3, 'three grants');
SELECT pg_temp.check((SELECT count(*) FROM system_access_grants WHERE effective_from = ((current_date + 7) + time '08:00') AT TIME ZONE 'Asia/Jerusalem') = 2, 'default start = first day 08:00 Israel');
SELECT pg_temp.check((SELECT effective_from FROM system_access_grants WHERE resource_id = '00000000-0000-0000-0000-0000000007a2') = '2026-12-01T08:00:00Z', 'explicit start kept');
SELECT pg_temp.check((SELECT jsonb_array_length(checklist) FROM it_tickets t JOIN system_access_requests r ON r.hub_ticket_id = t.id) = 3, 'hub ticket lists the grants');
SELECT pg_temp.check((SELECT requested_by_name FROM system_access_requests) = 'דנה', 'requester name snapshot');
-- Asking again for the same access is skipped; asking only for existing access fails
SELECT pg_temp.expect_error($$SELECT request_system_access('00000000-0000-0000-0000-0000000000e1', '[{"system_id":"00000000-0000-0000-0000-0000000005a1","group_id":"00000000-0000-0000-0000-0000000006a1"}]')$$, 'the employee already has%');

-- HR cannot dispatch or resolve; another company's admin cannot either
SELECT pg_temp.expect_error($$SELECT dispatch_system_access(ARRAY(SELECT id FROM system_access_grants))$$, 'not authorized%');
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a2',false);
SELECT pg_temp.expect_error($$SELECT resolve_system_access_grant('00000000-0000-0000-0000-000000000000', 'done')$$, 'grant not found%');

-- The manager executes Priority/כספים himself, and sends drive P to IT
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
SELECT pg_temp.check((SELECT status FROM resolve_system_access_grant(
  (SELECT id FROM system_access_grants WHERE resource_id = '00000000-0000-0000-0000-0000000007a1'), 'done', now() + interval '1 day', ' ahmad.f ')) = 'active', 'manager executes');
SELECT pg_temp.check((SELECT executed_at <= now() AND external_username = 'ahmad.f' AND executed_by_name = 'מנהל ההרשאות'
  FROM system_access_grants WHERE resource_id = '00000000-0000-0000-0000-0000000007a1'), 'execution time never in the future, user and name recorded');
SELECT pg_temp.expect_error($$SELECT resolve_system_access_grant((SELECT id FROM system_access_grants WHERE resource_id = '00000000-0000-0000-0000-0000000007a2'), 'reject')$$, 'a reason is required%');
SELECT dispatch_system_access(ARRAY(SELECT id FROM system_access_grants WHERE group_id IS NOT NULL), 'דחוף') AS dispatched;
SELECT pg_temp.check((SELECT status FROM system_access_grants WHERE group_id IS NOT NULL) = 'dispatched', 'dispatched');
SELECT pg_temp.check((SELECT description LIKE '%GRP_P_Engineering%' AND assigned_to IS NULL FROM it_tickets t JOIN system_access_grants g ON g.dispatch_ticket_id = t.id), 'owner ticket names the AD group');
SELECT pg_temp.expect_error($$SELECT dispatch_system_access(ARRAY(SELECT id FROM system_access_grants WHERE group_id IS NOT NULL))$$, 'only waiting grants%');

-- Operations (not owner of drive P) cannot resolve IT's grant; IT can return it with a reason
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a5',false);
SELECT pg_temp.expect_error($$SELECT resolve_system_access_grant((SELECT id FROM system_access_grants WHERE group_id IS NOT NULL), 'done')$$, 'not authorized%');
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a4',false);
SELECT pg_temp.expect_error($$SELECT resolve_system_access_grant((SELECT id FROM system_access_grants WHERE resource_id = '00000000-0000-0000-0000-0000000007a2'), 'done')$$, 'not authorized%');
SELECT resolve_system_access_grant((SELECT id FROM system_access_grants WHERE group_id IS NOT NULL), 'return', NULL, NULL, 'חסר שם משתמש');
SELECT pg_temp.check((SELECT status = 'requested' AND dispatch_ticket_id IS NULL AND note LIKE 'הוחזר ע"י איש IT%' FROM system_access_grants WHERE group_id IS NOT NULL), 'returned to the manager');

-- Sent again; IT closes the owner ticket in the ticket screen → grant opens, everything syncs back
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
SELECT dispatch_system_access(ARRAY(SELECT id FROM system_access_grants WHERE group_id IS NOT NULL));
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a4',false);
UPDATE it_tickets SET status = 'done' WHERE id = (SELECT dispatch_ticket_id FROM system_access_grants WHERE group_id IS NOT NULL);
SELECT pg_temp.check((SELECT status = 'active' AND executed_by_name = 'איש IT' FROM system_access_grants WHERE group_id IS NOT NULL), 'closing the owner ticket opens its grants');
SELECT pg_temp.check((SELECT status FROM system_access_requests) = 'open', 'request still open (Priority/רכש waiting)');
SELECT pg_temp.check((SELECT (c->>'done')::boolean AND c->>'label' LIKE '%נפתח · איש IT%'
  FROM it_tickets t JOIN system_access_requests r ON r.hub_ticket_id = t.id, jsonb_array_elements(t.checklist) c
  WHERE c->>'label' LIKE 'כונן P%'), 'hub ticket shows who opened drive P');

-- The manager ticks the last line in the hub ticket → grant active, request and hub ticket done
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
UPDATE it_tickets t SET checklist = (
  SELECT jsonb_agg(CASE WHEN c->>'label' LIKE '%רכש%' THEN jsonb_set(c, '{done}', 'true') ELSE c END)
  FROM jsonb_array_elements(t.checklist) c)
WHERE t.id = (SELECT hub_ticket_id FROM system_access_requests);
SELECT pg_temp.check((SELECT status FROM system_access_grants WHERE resource_id = '00000000-0000-0000-0000-0000000007a2') = 'active', 'hub tick opens the grant');
SELECT pg_temp.check((SELECT status FROM system_access_requests) = 'done', 'request done');
SELECT pg_temp.check((SELECT t.status FROM it_tickets t JOIN system_access_requests r ON r.hub_ticket_id = t.id) = 'done', 'hub ticket closed');
RESET ROLE;

-- Audit: every grant change with actor and employee
SELECT pg_temp.check((SELECT count(*) FROM permission_audit_log WHERE action LIKE 'system_access_grants_%' AND target_employee_id = '00000000-0000-0000-0000-0000000000e1') >= 8, 'grant audit rows');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM permission_audit_log WHERE action LIKE 'system_access_grants_%' AND actor_user_id IS NULL), 'no anonymous grant rows');
SELECT 'requests: all assertions passed' AS result;

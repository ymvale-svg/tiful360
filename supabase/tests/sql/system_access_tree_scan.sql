\set ON_ERROR_STOP 1
INSERT INTO companies(id,name) VALUES ('00000000-0000-0000-0000-0000000000c1','A'),('00000000-0000-0000-0000-0000000000c2','B');
INSERT INTO user_roles VALUES ('00000000-0000-0000-0000-0000000000a4','it_manager'),('00000000-0000-0000-0000-0000000000a3','hr'),('00000000-0000-0000-0000-0000000000a2','it_manager');
INSERT INTO user_company_access VALUES ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c2');
INSERT INTO system_access_systems(id,company_id,name) VALUES
  ('00000000-0000-0000-0000-0000000005a1','00000000-0000-0000-0000-0000000000c1','כונן P'),
  ('00000000-0000-0000-0000-0000000005b1','00000000-0000-0000-0000-0000000000c2','כונן של B');
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
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text, text), pg_temp.check(boolean, text) TO authenticated, service_role;
-- As in Supabase, the service role reads every table.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
CREATE TEMP TABLE keys(name text, token text);
GRANT ALL ON keys TO authenticated, service_role;

SET ROLE authenticated;
-- HR and another company's IT cannot create a key; IT of A can, and sees it once
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a3',false);
SELECT pg_temp.expect_error($$SELECT create_system_access_scan_token('00000000-0000-0000-0000-0000000005a1')$$, 'not authorized%');
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a2',false);
SELECT pg_temp.expect_error($$SELECT create_system_access_scan_token('00000000-0000-0000-0000-0000000005a1')$$, 'not authorized%');
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a4',false);
INSERT INTO keys SELECT 'p', create_system_access_scan_token('00000000-0000-0000-0000-0000000005a1');
SELECT pg_temp.check((SELECT length(token) = 64 FROM keys), 'key is 64 hex chars');
SELECT pg_temp.expect_error($$SELECT * FROM system_access_scan_keys$$, '%permission denied%');
SELECT pg_temp.check((system_access_scan_status('00000000-0000-0000-0000-0000000005a1')->>'connected')::boolean, 'status connected');
-- The ingest function is not callable by signed-in users
SELECT pg_temp.expect_error($$SELECT ingest_system_access_tree('00000000-0000-0000-0000-0000000005a1', (SELECT token FROM keys), ARRAY['x'], 'agent')$$, '%permission denied%');
-- Manual import still works on the shared core
SELECT import_system_access_tree('00000000-0000-0000-0000-0000000005a1', ARRAY['ידני']);
RESET ROLE;

SET ROLE service_role;
-- Wrong key, another system's key, no key: refused
SELECT pg_temp.expect_error($$SELECT ingest_system_access_tree('00000000-0000-0000-0000-0000000005a1', 'wrong', ARRAY['x'], 'agent')$$, 'invalid scan key%');
SELECT pg_temp.expect_error($$SELECT ingest_system_access_tree('00000000-0000-0000-0000-0000000005b1', (SELECT token FROM keys), ARRAY['x'], 'agent')$$, 'invalid scan key%');
-- The right key imports, flags what is gone, and records the scan
SELECT ingest_system_access_tree('00000000-0000-0000-0000-0000000005a1', (SELECT token FROM keys), ARRAY['פרויקטים\תכנון', 'כספים'], 'FILESRV01') AS scan;
SELECT pg_temp.check((SELECT count(*) FROM system_access_resources WHERE system_id = '00000000-0000-0000-0000-0000000005a1') = 4, 'three new plus the manual one');
SELECT pg_temp.check((SELECT missing_since IS NOT NULL FROM system_access_resources WHERE path = 'ידני'), 'manual folder flagged missing');
SELECT pg_temp.check((SELECT scan_agent = 'FILESRV01' AND (scan_last_result->>'added')::int = 3 FROM system_access_systems WHERE id = '00000000-0000-0000-0000-0000000005a1'), 'scan recorded');
SELECT pg_temp.check((SELECT count(*) FROM permission_audit_log WHERE details LIKE 'סריקה אוטומטית (FILESRV01) לכונן P%') = 1, 'scan audited');
RESET ROLE;

-- Revoking the key stops the agent
SET ROLE authenticated;
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a4',false);
SELECT revoke_system_access_scan_token('00000000-0000-0000-0000-0000000005a1');
RESET ROLE;
SET ROLE service_role;
SELECT pg_temp.expect_error($$SELECT ingest_system_access_tree('00000000-0000-0000-0000-0000000005a1', (SELECT token FROM keys), ARRAY['x'], 'agent')$$, 'invalid scan key%');
RESET ROLE;
SELECT 'tree scan: all assertions passed' AS result;

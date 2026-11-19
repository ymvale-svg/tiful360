\set ON_ERROR_STOP 1
INSERT INTO companies(id,name) VALUES ('00000000-0000-0000-0000-0000000000c1','A'),('00000000-0000-0000-0000-0000000000c2','B');
-- a1: admin of A · a2: admin of B · h1: HR of A · i1: IT of A
INSERT INTO user_roles VALUES ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000a2','admin'),
  ('00000000-0000-0000-0000-0000000000a3','hr'),('00000000-0000-0000-0000-0000000000a4','it_manager');
INSERT INTO user_company_access VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000c1');
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(_sql text, _like text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RAISE EXCEPTION 'FAIL: expected error like % for %', _like, _sql;
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
  IF SQLERRM NOT LIKE _like THEN RAISE EXCEPTION 'FAIL: got "%" expected like "%"', SQLERRM, _like; END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text, text) TO authenticated;

-- IT of company A creates drive P (company forced from the client value? client must send it for systems)
SET ROLE authenticated;
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a4',false);
INSERT INTO system_access_systems(id, company_id, name, owner_role, resource_label)
VALUES ('00000000-0000-0000-0000-0000000005a1','00000000-0000-0000-0000-0000000000c1','כונן P','it_manager','תיקייה');
-- Cannot create a system in company B
SELECT pg_temp.expect_error($$INSERT INTO system_access_systems(company_id, name) VALUES ('00000000-0000-0000-0000-0000000000c2','X')$$, '%row-level security%');

-- Import a tree: prefixes become nodes, company comes from the system
SELECT import_system_access_tree('00000000-0000-0000-0000-0000000005a1', ARRAY['פרויקטים\תכנון', 'פרויקטים\ביצוע', 'פרויקטים\\חוזים\', 'כספים']) AS first_import;
DO $$ BEGIN
  IF (SELECT count(*) FROM system_access_resources) <> 5 THEN RAISE EXCEPTION 'FAIL count %', (SELECT count(*) FROM system_access_resources); END IF;
  IF EXISTS (SELECT 1 FROM system_access_resources WHERE company_id <> '00000000-0000-0000-0000-0000000000c1') THEN RAISE EXCEPTION 'FAIL company'; END IF;
  IF (SELECT p.path FROM system_access_resources c JOIN system_access_resources p ON p.id = c.parent_id WHERE c.path = 'פרויקטים\חוזים') <> 'פרויקטים' THEN RAISE EXCEPTION 'FAIL parent'; END IF;
END $$;

-- Group with resources; a client-sent company is overwritten by the trigger
INSERT INTO system_access_groups(id, system_id, company_id, name, external_name)
VALUES ('00000000-0000-0000-0000-0000000006a1','00000000-0000-0000-0000-0000000005a1','00000000-0000-0000-0000-0000000000c1','הנדסה','GRP_P_Engineering');
INSERT INTO system_access_group_resources(group_id, resource_id, company_id, level)
SELECT '00000000-0000-0000-0000-0000000006a1', id, '00000000-0000-0000-0000-0000000000c1', CASE WHEN path LIKE '%חוזים' THEN 'read' ELSE 'write' END
FROM system_access_resources WHERE starts_with(path, 'פרויקטים' || chr(92));

-- Re-import without "כספים" and with a new folder: flagged, not deleted; group links kept
SELECT import_system_access_tree('00000000-0000-0000-0000-0000000005a1', ARRAY['פרויקטים\תכנון', 'פרויקטים\ביצוע', 'פרויקטים\חוזים', 'פרויקטים\פיקוח']) AS second_import;
DO $$ BEGIN
  IF (SELECT missing_since IS NULL FROM system_access_resources WHERE path = 'כספים') THEN RAISE EXCEPTION 'FAIL missing flag'; END IF;
  IF (SELECT count(*) FROM system_access_group_resources) <> 3 THEN RAISE EXCEPTION 'FAIL links kept'; END IF;
END $$;
-- Return of a missing folder clears the flag
SELECT import_system_access_tree('00000000-0000-0000-0000-0000000005a1', ARRAY['כספים', 'פרויקטים\תכנון', 'פרויקטים\ביצוע', 'פרויקטים\חוזים', 'פרויקטים\פיקוח']) AS third_import;
DO $$ BEGIN IF (SELECT missing_since IS NOT NULL FROM system_access_resources WHERE path = 'כספים') THEN RAISE EXCEPTION 'FAIL returned'; END IF; END $$;

-- HR of A reads the catalog but cannot change it or import
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a3',false);
DO $$ BEGIN IF (SELECT count(*) FROM system_access_groups) <> 1 THEN RAISE EXCEPTION 'FAIL hr read'; END IF; END $$;
SELECT pg_temp.expect_error($$SELECT import_system_access_tree('00000000-0000-0000-0000-0000000005a1', ARRAY['x'])$$, 'not authorized%');
UPDATE system_access_groups SET name = 'hacked';
DO $$ BEGIN IF (SELECT name FROM system_access_groups) <> 'הנדסה' THEN RAISE EXCEPTION 'FAIL hr write'; END IF; END $$;

-- Admin of company B sees nothing of A
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a2',false);
DO $$ BEGIN IF (SELECT count(*) FROM system_access_resources) <> 0 THEN RAISE EXCEPTION 'FAIL tenant isolation'; END IF; END $$;
SELECT pg_temp.expect_error($$SELECT import_system_access_tree('00000000-0000-0000-0000-0000000005a1', ARRAY['x'])$$, 'not authorized%');
RESET ROLE;

-- A group cannot bundle a resource of another system
INSERT INTO system_access_systems(id, company_id, name) VALUES ('00000000-0000-0000-0000-0000000005a2','00000000-0000-0000-0000-0000000000c1','ויפלנס');
INSERT INTO system_access_resources(id, system_id, company_id, name, path) VALUES ('00000000-0000-0000-0000-0000000007a1','00000000-0000-0000-0000-0000000005a2','00000000-0000-0000-0000-0000000000c2','פרויקט','פרויקט');
DO $$ BEGIN IF (SELECT company_id FROM system_access_resources WHERE id='00000000-0000-0000-0000-0000000007a1') <> '00000000-0000-0000-0000-0000000000c1' THEN RAISE EXCEPTION 'FAIL company forced'; END IF; END $$;
SELECT pg_temp.expect_error($$INSERT INTO system_access_group_resources(group_id, resource_id, company_id) VALUES ('00000000-0000-0000-0000-0000000006a1','00000000-0000-0000-0000-0000000007a1','00000000-0000-0000-0000-0000000000c1')$$, 'resource and group belong to different systems%');

-- Audit: actor recorded for IT's writes and imports
DO $$ BEGIN
  IF (SELECT count(*) FROM permission_audit_log WHERE action = 'system_access_tree_import' AND actor_user_id = '00000000-0000-0000-0000-0000000000a4') <> 3 THEN RAISE EXCEPTION 'FAIL import audit'; END IF;
  IF (SELECT count(*) FROM permission_audit_log WHERE action = 'system_access_groups_insert') <> 1 THEN RAISE EXCEPTION 'FAIL group audit'; END IF;
  IF (SELECT count(*) FROM permission_audit_log WHERE action = 'system_access_group_resources_insert') <> 3 THEN RAISE EXCEPTION 'FAIL link audit'; END IF;
END $$;
SELECT 'catalog: all assertions passed' AS result;

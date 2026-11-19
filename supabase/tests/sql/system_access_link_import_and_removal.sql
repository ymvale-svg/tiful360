\set ON_ERROR_STOP 1
-- applies: 20261110310000_remove_digital_access_and_tree_scan.sql
-- a1 admin of A · a3 HR of A · a2 admin of B
INSERT INTO companies(id,name) VALUES ('00000000-0000-0000-0000-0000000000c1','A'),('00000000-0000-0000-0000-0000000000c2','B');
INSERT INTO profiles VALUES ('00000000-0000-0000-0000-0000000000a1','מנהל ההרשאות'),('00000000-0000-0000-0000-0000000000a3','דנה');
INSERT INTO user_roles VALUES ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000a3','hr'),('00000000-0000-0000-0000-0000000000a2','admin');
INSERT INTO user_company_access VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c2');
INSERT INTO employees(id,company_id,full_name,start_date,status) VALUES
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1','בקליטה', current_date + 3,'onboarding'),
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c1','טיוטה בלבד', current_date + 3,'onboarding'),
  ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c1','ותיק', '2020-01-05','active'),
  ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000c1','עזב', '2019-01-01','inactive');
INSERT INTO onboarding_processes(id,company_id,employee_id,status) VALUES
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e1','in_progress'),
  ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e2','draft');
INSERT INTO system_access_systems(id,company_id,name) VALUES ('00000000-0000-0000-0000-0000000005a2','00000000-0000-0000-0000-0000000000c1','פריוריטי');
-- Legacy access: assets in digital categories, and the old digital_access list
INSERT INTO asset_categories(id,company_id,category_name,prefix,domain) VALUES
  ('00000000-0000-0000-0000-00000000ca01','00000000-0000-0000-0000-0000000000c1',' Priority ','DACC','digital'),
  ('00000000-0000-0000-0000-00000000ca02','00000000-0000-0000-0000-0000000000c1','מחשב נייד','LPT','physical'),
  ('00000000-0000-0000-0000-00000000ca03','00000000-0000-0000-0000-0000000000c1','פריוריטי','DACC','digital');
INSERT INTO asset_groups(id,category_id,name) VALUES ('00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000ca03','כספים');
INSERT INTO assets(company_id,category_id,group_id,asset_name,current_owner_id,status,account_username) VALUES
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000ca03','00000000-0000-0000-0000-00000000ab01','פריוריטי כספים','00000000-0000-0000-0000-0000000000e3','in_use','VATIK'),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000ca01',NULL,'Priority','00000000-0000-0000-0000-0000000000e3','in_use',NULL),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000ca02',NULL,'Laptop','00000000-0000-0000-0000-0000000000e3','in_use',NULL),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000ca03',NULL,'של מי שעזב','00000000-0000-0000-0000-0000000000e4','in_use',NULL);
INSERT INTO digital_access(employee_id,company_id,access_type,resource_path,status) VALUES
  ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c1','כונן P','פרויקטים/תכנון','active'),
  ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c1','כונן P','ישן','suspended');
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
-- 1. A request from the screen joins the employee's open onboarding; a draft onboarding is left alone
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a3',false);
SELECT pg_temp.check((request_system_access('00000000-0000-0000-0000-0000000000e1', '[{"system_id":"00000000-0000-0000-0000-0000000005a2"}]')->>'onboardingProcessId') = '00000000-0000-0000-0000-0000000000f1', 'linked to the open onboarding');
SELECT pg_temp.check((SELECT onboarding_process_id FROM system_access_requests WHERE employee_id = '00000000-0000-0000-0000-0000000000e1') = '00000000-0000-0000-0000-0000000000f1', 'stored link');
SELECT pg_temp.check((request_system_access('00000000-0000-0000-0000-0000000000e2', '[{"system_id":"00000000-0000-0000-0000-0000000005a2"}]')->>'onboardingProcessId') IS NULL, 'draft not linked');

-- 2. Import: HR and another company's admin may not; a preview writes nothing
SELECT pg_temp.expect_error($$SELECT import_legacy_system_access('00000000-0000-0000-0000-0000000000c1')$$, 'not authorized%');
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a2',false);
SELECT pg_temp.expect_error($$SELECT import_legacy_system_access('00000000-0000-0000-0000-0000000000c1', true)$$, 'not authorized%');
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
SELECT import_legacy_system_access('00000000-0000-0000-0000-0000000000c1') AS preview \gset
SELECT pg_temp.check((:'preview'::jsonb->>'grants')::int = 3 AND (:'preview'::jsonb->>'applied')::boolean = false, 'preview counts three grants');
SELECT pg_temp.check((:'preview'::jsonb->>'systemsCreated')::int = 2, 'preview: Priority and drive P are new (פריוריטי exists)');
SELECT pg_temp.check((SELECT count(*) FROM system_access_systems) = 1 AND (SELECT count(*) FROM system_access_grants) = 2, 'preview wrote nothing');

-- Apply: assets of digital categories and active digital_access rows; laptops, suspended rows and people who left are not imported
SELECT import_legacy_system_access('00000000-0000-0000-0000-0000000000c1', true) AS applied \gset
SELECT pg_temp.check((:'applied'::jsonb->>'grants')::int = 3 AND (:'applied'::jsonb->>'employees')::int = 1, 'three grants for one employee');
SELECT pg_temp.check((SELECT count(*) FROM system_access_grants g JOIN system_access_systems s ON s.id = g.system_id
  WHERE g.employee_id = '00000000-0000-0000-0000-0000000000e3' AND g.status = 'active') = 3, 'active grants created');
SELECT pg_temp.check((SELECT g.external_username = 'VATIK' AND r.path = 'כספים' AND g.executed_at IS NULL
  AND g.effective_from = ('2020-01-05'::date + time '08:00') AT TIME ZONE 'Asia/Jerusalem'
  FROM system_access_grants g JOIN system_access_resources r ON r.id = g.resource_id WHERE g.external_username IS NOT NULL), 'user name, environment, start from the first day, opening date unknown');
SELECT pg_temp.check((SELECT path FROM system_access_resources r JOIN system_access_systems s ON s.id = r.system_id WHERE s.name = 'כונן P') = 'פרויקטים\תכנון', 'path separator normalised');
SELECT pg_temp.check((SELECT count(*) FROM system_access_requests WHERE note = 'ייבוא הרשאות קיימות מהמשאבים' AND status = 'done' AND hub_ticket_id IS NULL) = 1, 'one completed request, no ticket');
-- Running it again imports nothing new
SELECT pg_temp.check((import_legacy_system_access('00000000-0000-0000-0000-0000000000c1', true)->>'grants')::int = 0, 'idempotent');
RESET ROLE;
SELECT pg_temp.check((SELECT count(*) FROM permission_audit_log WHERE action = 'system_access_legacy_import') = 2, 'each import audited');

-- 3. Removal (20261110310000): the import is undone, the digital domain and the nightly scan go.
-- Before it runs: a group set up by hand on the imported drive, and an alert on a digital asset.
INSERT INTO system_access_groups(system_id, name) SELECT id, 'הנדסה' FROM system_access_systems WHERE name = 'כונן P';
INSERT INTO alerts(title, related_asset_id) SELECT 'תפוגת סיסמה', id FROM assets WHERE account_username = 'VATIK';
\i supabase/migrations/20261110310000_remove_digital_access_and_tree_scan.sql
SELECT pg_temp.check((SELECT count(*) FROM system_access_grants WHERE note LIKE 'יובא%') = 0
  AND NOT EXISTS (SELECT 1 FROM system_access_requests WHERE note = 'ייבוא הרשאות קיימות מהמשאבים'), 'imported grants and request removed');
SELECT pg_temp.check((SELECT count(*) FROM system_access_grants) = 2, 'grants requested by hand stay');
SELECT pg_temp.check((SELECT array_agg(name ORDER BY name) FROM system_access_systems) = ARRAY['כונן P', 'פריוריטי'],
  'Priority (import only) removed; the drive keeps its group; the existing system stays');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM system_access_resources), 'imported environments removed');
SELECT pg_temp.check((SELECT array_agg(category_name) FROM asset_categories) = ARRAY['מחשב נייד']
  AND (SELECT array_agg(asset_name) FROM assets) = ARRAY['Laptop'], 'digital categories and assets removed, equipment stays');
SELECT pg_temp.check((SELECT related_asset_id FROM alerts) IS NULL, 'alert detached from the deleted asset');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM digital_access), 'old list emptied');
SELECT pg_temp.expect_error($$INSERT INTO asset_categories(company_id, category_name, domain) VALUES ('00000000-0000-0000-0000-0000000000c1', 'x', 'digital')$$, '%asset_categories_domain_check%');
SELECT pg_temp.check(to_regclass('public.system_access_scan_keys') IS NULL
  AND to_regprocedure('public.ingest_system_access_tree(uuid,text,text[],text)') IS NULL
  AND to_regprocedure('public.import_legacy_system_access(uuid,boolean)') IS NULL
  AND to_regprocedure('public.import_system_access_tree(uuid,text[])') IS NOT NULL, 'scan and import functions removed, manual tree import kept');
SELECT pg_temp.check((SELECT count(*) FROM permission_audit_log WHERE action IN ('system_access_legacy_import_undone', 'digital_access_domain_removed')) = 2, 'removal audited');

-- 4. The portal: an employee sees only their own held access
UPDATE employees SET linked_user_id = '00000000-0000-0000-0000-0000000000a9' WHERE id = '00000000-0000-0000-0000-0000000000e1';
UPDATE system_access_grants SET status = 'active' WHERE employee_id = '00000000-0000-0000-0000-0000000000e1';
SET ROLE authenticated;
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a9',false);
SELECT pg_temp.check((SELECT array_agg(system_name) FROM my_system_access('00000000-0000-0000-0000-0000000000c1')) = ARRAY['פריוריטי'], 'own access listed');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM my_system_access('00000000-0000-0000-0000-0000000000c2')), 'nothing for another company');
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM my_system_access('00000000-0000-0000-0000-0000000000c1')), 'an admin without an employee card sees nothing here');
RESET ROLE;
SELECT 'link, import and removal: all assertions passed' AS result;

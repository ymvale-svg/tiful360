\set ON_ERROR_STOP 1
-- Fixtures
INSERT INTO companies(id,name) VALUES ('00000000-0000-0000-0000-0000000000c1','A'),('00000000-0000-0000-0000-0000000000c2','B');
INSERT INTO user_roles VALUES ('00000000-0000-0000-0000-0000000000a1','operations'),('00000000-0000-0000-0000-0000000000a2','operations');
INSERT INTO user_company_access VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c2');
INSERT INTO employees(id,company_id,full_name,status) VALUES ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1','New','onboarding'),('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c1','Other','active');
INSERT INTO assets(id,company_id,asset_name,asset_code,status,current_owner_id) VALUES
 ('00000000-0000-0000-0000-00000000aa01','00000000-0000-0000-0000-0000000000c1','Laptop','LPT-1','in_stock',NULL),
 ('00000000-0000-0000-0000-00000000aa02','00000000-0000-0000-0000-0000000000c1','Broken','LPT-2','in_repair',NULL),
 ('00000000-0000-0000-0000-00000000aa03','00000000-0000-0000-0000-0000000000c1','Phone','PHN-1','in_use','00000000-0000-0000-0000-0000000000e1'),
 ('00000000-0000-0000-0000-00000000aa04','00000000-0000-0000-0000-0000000000c1','Theirs','LPT-3','in_use','00000000-0000-0000-0000-0000000000e2');
INSERT INTO onboarding_processes(id,company_id,employee_id,status) VALUES ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e1','sent');
INSERT INTO onboarding_items(id,process_id,item_type,title,asset_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000f1','asset','laptop','00000000-0000-0000-0000-00000000aa01'),
 ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000f1','asset','no asset',NULL),
 ('00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000f1','task','payroll',NULL),
 ('00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000f1','asset','broken','00000000-0000-0000-0000-00000000aa02'),
 ('00000000-0000-0000-0000-0000000000b5','00000000-0000-0000-0000-0000000000f1','asset','own phone','00000000-0000-0000-0000-00000000aa03'),
 ('00000000-0000-0000-0000-0000000000b6','00000000-0000-0000-0000-0000000000f1','asset','theirs','00000000-0000-0000-0000-00000000aa04');

CREATE OR REPLACE FUNCTION pg_temp.expect_error(_sql text, _like text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RAISE EXCEPTION 'FAIL: expected error like % for %', _like, _sql;
EXCEPTION WHEN raise_exception OR others THEN
  IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
  IF SQLERRM NOT LIKE _like THEN RAISE EXCEPTION 'FAIL: got "%" expected like "%"', SQLERRM, _like; END IF;
END $$;

-- Other company's operator is refused
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a2',false);
SELECT pg_temp.expect_error($$SELECT complete_onboarding_item('00000000-0000-0000-0000-0000000000b1', true)$$, 'not authorized%');

SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
-- Asset item without asset is refused; asset in repair refused; someone else's refused
SELECT pg_temp.expect_error($$SELECT complete_onboarding_item('00000000-0000-0000-0000-0000000000b2', true)$$, 'asset required%');
SELECT pg_temp.expect_error($$SELECT complete_onboarding_item('00000000-0000-0000-0000-0000000000b4', true)$$, 'asset is not in stock%');
SELECT pg_temp.expect_error($$SELECT complete_onboarding_item('00000000-0000-0000-0000-0000000000b6', true)$$, 'asset is assigned to another employee%');

-- Task closes without asset, with note
SELECT status, completion_note FROM complete_onboarding_item('00000000-0000-0000-0000-0000000000b3', true, ' נפתח תיק ');
DO $$ BEGIN IF (SELECT completion_note FROM onboarding_items WHERE id='00000000-0000-0000-0000-0000000000b3') <> 'נפתח תיק' THEN RAISE EXCEPTION 'FAIL note'; END IF; END $$;

-- Tick laptop: assigned, process -> in_progress, activity logged
SELECT complete_onboarding_item('00000000-0000-0000-0000-0000000000b1', true);
DO $$ BEGIN
  IF (SELECT current_owner_id FROM assets WHERE id='00000000-0000-0000-0000-00000000aa01') <> '00000000-0000-0000-0000-0000000000e1' THEN RAISE EXCEPTION 'FAIL owner'; END IF;
  IF (SELECT status FROM assets WHERE id='00000000-0000-0000-0000-00000000aa01') <> 'in_use' THEN RAISE EXCEPTION 'FAIL status'; END IF;
  IF (SELECT status FROM onboarding_processes WHERE id='00000000-0000-0000-0000-0000000000f1') <> 'in_progress' THEN RAISE EXCEPTION 'FAIL process'; END IF;
  IF (SELECT count(*) FROM activity_log WHERE entity_id='00000000-0000-0000-0000-00000000aa01' AND performed_by='00000000-0000-0000-0000-0000000000a1') <> 1 THEN RAISE EXCEPTION 'FAIL log'; END IF;
END $$;

-- Done item cannot be deleted
SELECT pg_temp.expect_error($$DELETE FROM onboarding_items WHERE id='00000000-0000-0000-0000-0000000000b1'$$, 'a completed onboarding item cannot be deleted%');

-- Untick laptop: back to stock
SELECT complete_onboarding_item('00000000-0000-0000-0000-0000000000b1', false);
DO $$ BEGIN
  IF (SELECT current_owner_id FROM assets WHERE id='00000000-0000-0000-0000-00000000aa01') IS NOT NULL THEN RAISE EXCEPTION 'FAIL untick owner'; END IF;
  IF (SELECT status FROM assets WHERE id='00000000-0000-0000-0000-00000000aa01') <> 'in_stock' THEN RAISE EXCEPTION 'FAIL untick status'; END IF;
END $$;

-- Phone already owned by the employee: tick then untick keeps it with the employee
SELECT complete_onboarding_item('00000000-0000-0000-0000-0000000000b5', true);
SELECT complete_onboarding_item('00000000-0000-0000-0000-0000000000b5', false);
DO $$ BEGIN
  IF (SELECT current_owner_id FROM assets WHERE id='00000000-0000-0000-0000-00000000aa03') <> '00000000-0000-0000-0000-0000000000e1' THEN RAISE EXCEPTION 'FAIL prior owner kept'; END IF;
END $$;

-- Pending item can still be deleted
DELETE FROM onboarding_items WHERE id='00000000-0000-0000-0000-0000000000b2';

-- Finishing makes the employee active; deleting the process cascades even with done items
UPDATE onboarding_processes SET status='done' WHERE id='00000000-0000-0000-0000-0000000000f1';
DO $$ BEGIN IF (SELECT status FROM employees WHERE id='00000000-0000-0000-0000-0000000000e1') <> 'active' THEN RAISE EXCEPTION 'FAIL activate'; END IF; END $$;
DELETE FROM onboarding_processes WHERE id='00000000-0000-0000-0000-0000000000f1';
SELECT 'checklist: all assertions passed' AS result;

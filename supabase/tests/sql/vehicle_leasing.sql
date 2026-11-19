\set ON_ERROR_STOP 1
-- o1 operations of A · h1 HR of A · o2 operations of B
INSERT INTO companies(id,name) VALUES ('00000000-0000-0000-0000-0000000000c1','A'),('00000000-0000-0000-0000-0000000000c2','B');
INSERT INTO profiles VALUES ('00000000-0000-0000-0000-0000000000a1','רכז רכב');
INSERT INTO user_roles VALUES ('00000000-0000-0000-0000-0000000000a1','operations'),('00000000-0000-0000-0000-0000000000a3','hr'),('00000000-0000-0000-0000-0000000000a2','operations');
INSERT INTO user_company_access VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c2');
INSERT INTO employees(id,company_id,full_name,role,status) VALUES
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1','אחמד פוקרה','מהנדס ביצוע','onboarding'),
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c2','של B','x','active');
INSERT INTO onboarding_processes(id,company_id,employee_id) VALUES ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e1');
INSERT INTO onboarding_items(id,process_id,item_type,title) VALUES ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000f1','vehicle','רכב ליסינג');
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
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a1',false);
INSERT INTO suppliers(id, company_id, name, email) VALUES ('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-0000000000c1','ליסינג א','quotes@leasing-a.example');
SELECT pg_temp.expect_error($$INSERT INTO suppliers(company_id, name, email) VALUES ('00000000-0000-0000-0000-0000000000c1','ליסינג ב','not-an-email')$$, '%suppliers_email_check%');
INSERT INTO vehicle_tiers(id, company_id, name, level, monthly_cap) VALUES ('00000000-0000-0000-0000-00000000d101','00000000-0000-0000-0000-0000000000c1','רמה 2',2,3500);
INSERT INTO vehicle_tier_roles(tier_id, company_id, role_name) VALUES ('00000000-0000-0000-0000-00000000d101','00000000-0000-0000-0000-0000000000c2','מהנדס ביצוע');
SELECT pg_temp.check((SELECT company_id FROM vehicle_tier_roles) = '00000000-0000-0000-0000-0000000000c1', 'tier role company from its tier');

-- A request for the onboarding item; creator stamped by the DB
INSERT INTO vehicle_requests(id, company_id, employee_id, onboarding_item_id, tier_id, preferences, created_by_name)
VALUES ('00000000-0000-0000-0000-00000000d201','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000d101','{"fuel":"היברידי"}','מזויף');
SELECT pg_temp.check((SELECT created_by_name = 'רכז רכב' AND created_by = '00000000-0000-0000-0000-0000000000a1' FROM vehicle_requests), 'creator stamped');
SELECT pg_temp.expect_error($$INSERT INTO vehicle_requests(company_id, employee_id, onboarding_item_id) VALUES ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1')$$, '%vehicle_requests_one_per_item%');
SELECT pg_temp.expect_error($$INSERT INTO vehicle_requests(company_id, employee_id) VALUES ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e2')$$, 'employee belongs to another company%');

-- Quotes take the request's company; a supplier of another company is refused; choosing one
INSERT INTO vehicle_quotes(id, request_id, company_id, supplier_id, model, monthly_price) VALUES
  ('00000000-0000-0000-0000-00000000d301','00000000-0000-0000-0000-00000000d201','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-00000000d001','טויוטה קורולה',3200);
SELECT pg_temp.check((SELECT company_id FROM vehicle_quotes) = '00000000-0000-0000-0000-0000000000c1', 'quote company from its request');
UPDATE vehicle_requests SET chosen_quote_id = '00000000-0000-0000-0000-00000000d301', status = 'chosen', created_by_name = 'אחר';
SELECT pg_temp.check((SELECT status = 'chosen' AND created_by_name = 'רכז רכב' FROM vehicle_requests), 'chosen; creator cannot be rewritten');

-- HR reads but cannot write; another company sees nothing
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a3',false);
SELECT pg_temp.check((SELECT count(*) FROM vehicle_requests) = 1, 'hr reads');
UPDATE vehicle_requests SET status = 'cancelled';
SELECT pg_temp.check((SELECT status FROM vehicle_requests) = 'chosen', 'hr cannot write');
SELECT set_config('test.uid','00000000-0000-0000-0000-0000000000a2',false);
SELECT pg_temp.check((SELECT count(*) FROM suppliers) + (SELECT count(*) FROM vehicle_quotes) = 0, 'tenant isolation');
SELECT pg_temp.expect_error($$INSERT INTO vehicle_quotes(request_id, company_id) VALUES ('00000000-0000-0000-0000-00000000d201','00000000-0000-0000-0000-0000000000c2')$$, '%row-level security%');
RESET ROLE;
SELECT 'vehicles: all assertions passed' AS result;

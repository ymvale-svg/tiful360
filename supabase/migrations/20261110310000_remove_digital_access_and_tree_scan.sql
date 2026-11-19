-- System access is managed only in the system access screen.
--
-- 1. Undo the one-time legacy import (20261110300000): its grants, its "done" requests, and the
--    systems and environments it added to the catalog when nothing else uses them. Only what the
--    import wrote is touched: grants carry its note, and catalog rows were created in the same
--    transaction as its audit row (same now()).
-- 2. Remove the "digital access" asset domain: its assets, categories (fields and groups cascade)
--    and the old digital_access list. The digital_access table itself stays, empty, because the
--    automatic offboarding function still updates it.
-- 3. Remove the automatic (nightly) tree scan: keys, status columns and functions. Manual import of
--    a tree file (import_system_access_tree) stays.
-- Each company affected gets one audit row.

-- 1. Undo the legacy import ---------------------------------------------------------------------
DO $$
DECLARE
  _imports timestamptz[];
  _company record;
BEGIN
  SELECT array_agg(DISTINCT created_at) INTO _imports
  FROM public.permission_audit_log WHERE action = 'system_access_legacy_import';

  FOR _company IN
    SELECT g.company_id, count(*) AS grants
    FROM public.system_access_grants g
    WHERE g.note IN ('יובא מהמשאבים (גישות דיגיטליות)', 'יובא מרשימת הגישות הקודמת')
    GROUP BY g.company_id
  LOOP
    INSERT INTO public.permission_audit_log (actor_user_id, company_id, action, details)
    VALUES (NULL, _company.company_id, 'system_access_legacy_import_undone',
            'ביטול ייבוא ההרשאות הקיימות: ' || _company.grants || ' הרשאות נמחקו. ההרשאות מוזנות מחדש במסך הרשאות מערכות');
  END LOOP;

  DELETE FROM public.system_access_grants
  WHERE note IN ('יובא מהמשאבים (גישות דיגיטליות)', 'יובא מרשימת הגישות הקודמת');

  DELETE FROM public.system_access_requests r
  WHERE r.note = 'ייבוא הרשאות קיימות מהמשאבים'
    AND NOT EXISTS (SELECT 1 FROM public.system_access_grants g WHERE g.request_id = r.id);

  IF _imports IS NOT NULL THEN
    DELETE FROM public.system_access_resources r
    WHERE r.created_at = ANY (_imports)
      AND NOT EXISTS (SELECT 1 FROM public.system_access_grants g WHERE g.resource_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM public.system_access_group_resources gr WHERE gr.resource_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM public.system_access_resources c WHERE c.parent_id = r.id);

    DELETE FROM public.system_access_systems s
    WHERE s.created_at = ANY (_imports)
      AND NOT EXISTS (SELECT 1 FROM public.system_access_grants g WHERE g.system_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM public.system_access_groups gr WHERE gr.system_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM public.system_access_resources r WHERE r.system_id = s.id);
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.import_legacy_system_access(uuid, boolean);

-- 2. Remove the digital access domain -------------------------------------------------------------
DO $$
DECLARE
  _company record;
BEGIN
  FOR _company IN
    SELECT c.company_id,
           count(DISTINCT c.id) AS categories,
           count(a.id) AS assets,
           (SELECT count(*) FROM public.digital_access d WHERE d.company_id = c.company_id) AS legacy
    FROM public.asset_categories c
    LEFT JOIN public.assets a ON a.category_id = c.id
    WHERE c.domain = 'digital'
    GROUP BY c.company_id
    UNION
    SELECT d.company_id, 0, 0, count(*)
    FROM public.digital_access d
    WHERE NOT EXISTS (SELECT 1 FROM public.asset_categories c WHERE c.company_id = d.company_id AND c.domain = 'digital')
    GROUP BY d.company_id
  LOOP
    INSERT INTO public.permission_audit_log (actor_user_id, company_id, action, details)
    VALUES (NULL, _company.company_id, 'digital_access_domain_removed',
            'הסרת תחום גישות דיגיטליות: ' || _company.assets || ' משאבים, ' || _company.categories
            || ' קטגוריות ו-' || _company.legacy || ' רשומות מהרשימה הישנה נמחקו. ההרשאות מנוהלות במסך הרשאות מערכות');
  END LOOP;
END $$;

-- alerts.related_asset_id was created without ON DELETE; the other references cascade or set null.
UPDATE public.alerts SET related_asset_id = NULL
WHERE related_asset_id IN (
  SELECT a.id FROM public.assets a JOIN public.asset_categories c ON c.id = a.category_id WHERE c.domain = 'digital');

-- Nested assets point at their container with ON DELETE SET NULL.
DELETE FROM public.assets a
USING public.asset_categories c
WHERE c.id = a.category_id AND c.domain = 'digital';

DELETE FROM public.asset_categories WHERE domain = 'digital';

DELETE FROM public.digital_access;

ALTER TABLE public.asset_categories DROP CONSTRAINT IF EXISTS asset_categories_domain_check;
ALTER TABLE public.asset_categories
  ADD CONSTRAINT asset_categories_domain_check
  CHECK (domain IN ('physical', 'licenses', 'training', 'insurance', 'real_estate'));

-- 3. Remove the automatic tree scan --------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ingest_system_access_tree(uuid, text, text[], text);
DROP FUNCTION IF EXISTS public.create_system_access_scan_token(uuid);
DROP FUNCTION IF EXISTS public.revoke_system_access_scan_token(uuid);
DROP FUNCTION IF EXISTS public.system_access_scan_status(uuid);
DROP TABLE IF EXISTS public.system_access_scan_keys;
ALTER TABLE public.system_access_systems
  DROP COLUMN IF EXISTS scan_last_at,
  DROP COLUMN IF EXISTS scan_last_result,
  DROP COLUMN IF EXISTS scan_agent;

-- 4. The employee portal lists the employee's own access from here (it used to read digital assets).
-- Employees cannot read the grants table; this returns only their own held access, without
-- usernames, notes or who executed it.
CREATE OR REPLACE FUNCTION public.my_system_access(_company_id uuid)
RETURNS TABLE (id uuid, system_name text, target text, effective_from timestamptz, pending_revoke boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, s.name,
         COALESCE(gr.name, r.path),
         g.effective_from,
         g.status IN ('revoke_requested', 'revoke_dispatched')
  FROM public.system_access_grants g
  JOIN public.employees e ON e.id = g.employee_id
  JOIN public.system_access_systems s ON s.id = g.system_id
  LEFT JOIN public.system_access_groups gr ON gr.id = g.group_id
  LEFT JOIN public.system_access_resources r ON r.id = g.resource_id
  WHERE auth.uid() IS NOT NULL
    AND e.linked_user_id = auth.uid()
    AND e.company_id = _company_id
    AND g.status IN ('active', 'revoke_requested', 'revoke_dispatched')
  ORDER BY s.sort_order, s.name, 3;
$$;
REVOKE ALL ON FUNCTION public.my_system_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_system_access(uuid) TO authenticated;

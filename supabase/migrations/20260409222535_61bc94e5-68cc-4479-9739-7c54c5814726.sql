
-- ============================================================
-- EMPLOYEES
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view employees" ON employees;
CREATE POLICY "Users view company employees" ON employees
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins can manage employees" ON employees;
CREATE POLICY "Admins can insert company employees" ON employees
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND (company_id IS NOT NULL)
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can update employees" ON employees;
CREATE POLICY "Admins can update company employees" ON employees
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can delete employees" ON employees;
CREATE POLICY "Admins can delete company employees" ON employees
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

-- ============================================================
-- ASSETS
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view assets" ON assets;
CREATE POLICY "Users view company assets" ON assets
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins can manage assets" ON assets;
CREATE POLICY "Admins can insert company assets" ON assets
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can update assets" ON assets;
CREATE POLICY "Admins can update company assets" ON assets
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can delete assets" ON assets;
CREATE POLICY "Admins can delete company assets" ON assets
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

-- ============================================================
-- IT_TICKETS
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view tickets" ON it_tickets;
CREATE POLICY "Users view company tickets" ON it_tickets
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins and IT can manage tickets" ON it_tickets;
CREATE POLICY "Admins and IT manage company tickets" ON it_tickets
  FOR ALL TO authenticated
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

DROP POLICY IF EXISTS "Authenticated users can create tickets" ON it_tickets;
CREATE POLICY "Users can create company tickets" ON it_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'it_manager'::app_role)
      OR EXISTS (SELECT 1 FROM employees WHERE employees.linked_user_id = auth.uid() AND employees.company_id = it_tickets.company_id)
    )
  );

-- ============================================================
-- ALERTS
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view alerts" ON alerts;
CREATE POLICY "Users view company alerts" ON alerts
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins can manage alerts" ON alerts;
CREATE POLICY "Admins manage company alerts" ON alerts
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

-- ============================================================
-- ASSET_CATEGORIES
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view categories" ON asset_categories;
CREATE POLICY "Users view company categories" ON asset_categories
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins can manage categories" ON asset_categories;
CREATE POLICY "Admins manage company categories" ON asset_categories
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

-- ============================================================
-- CATEGORY_FIELDS
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view fields" ON category_fields;
CREATE POLICY "Users view company fields" ON category_fields
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins can manage fields" ON category_fields;
CREATE POLICY "Admins manage company fields" ON category_fields
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

-- ============================================================
-- DIGITAL_ACCESS
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view digital access" ON digital_access;
CREATE POLICY "Users view company digital access" ON digital_access
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins and IT can manage digital access" ON digital_access;
CREATE POLICY "Admins and IT manage company digital access" ON digital_access
  FOR ALL TO authenticated
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

-- ============================================================
-- ACTIVITY_LOG
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view activity log" ON activity_log;
CREATE POLICY "Users view company activity log" ON activity_log
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins and IT can insert activity log" ON activity_log;
CREATE POLICY "Admins and IT insert company activity log" ON activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================
DROP POLICY IF EXISTS "Everyone can view announcements" ON announcements;
CREATE POLICY "Users view company announcements" ON announcements
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins can manage announcements" ON announcements;
CREATE POLICY "Admins manage company announcements" ON announcements
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

-- ============================================================
-- KNOWLEDGE_BASE
-- ============================================================
DROP POLICY IF EXISTS "Everyone can view knowledge base" ON knowledge_base;
CREATE POLICY "Users view company knowledge base" ON knowledge_base
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins can manage knowledge base" ON knowledge_base;
CREATE POLICY "Admins manage company knowledge base" ON knowledge_base
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

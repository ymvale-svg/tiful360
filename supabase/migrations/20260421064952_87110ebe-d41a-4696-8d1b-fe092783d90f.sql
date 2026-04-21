-- ============================================
-- 1. Helper functions for new roles
-- ============================================
CREATE OR REPLACE FUNCTION public.is_payroll(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND (role = 'payroll'::app_role OR role = 'super_admin'::app_role)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_operations(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND (role = 'operations'::app_role OR role = 'super_admin'::app_role)
  )
$$;

-- ============================================
-- 2. attendance_corrections table
-- ============================================
CREATE TABLE IF NOT EXISTS public.attendance_corrections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  manager_id uuid,
  attendance_record_id uuid,
  correction_date date NOT NULL,
  original_check_in time,
  original_check_out time,
  requested_check_in time,
  requested_check_out time,
  reason text,
  attachment_url text,
  initiated_by text NOT NULL DEFAULT 'employee',
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  manager_note text,
  payroll_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_attendance_corrections_updated_at
BEFORE UPDATE ON public.attendance_corrections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_attendance_corrections_employee ON public.attendance_corrections(employee_id);
CREATE INDEX idx_attendance_corrections_company_status ON public.attendance_corrections(company_id, status);

-- RLS for attendance_corrections
CREATE POLICY "Employees view own corrections"
ON public.attendance_corrections FOR SELECT TO authenticated
USING (is_my_employee_record(employee_id, auth.uid()));

CREATE POLICY "Employees create own corrections"
ON public.attendance_corrections FOR INSERT TO authenticated
WITH CHECK (is_my_employee_record(employee_id, auth.uid()) AND status = 'pending');

CREATE POLICY "Employees cancel own pending corrections"
ON public.attendance_corrections FOR UPDATE TO authenticated
USING (is_my_employee_record(employee_id, auth.uid()) AND status = 'pending');

CREATE POLICY "Direct managers view subordinate corrections"
ON public.attendance_corrections FOR SELECT TO authenticated
USING (is_direct_manager_of(employee_id, auth.uid()));

CREATE POLICY "Direct managers manage subordinate corrections"
ON public.attendance_corrections FOR INSERT TO authenticated
WITH CHECK (is_direct_manager_of(employee_id, auth.uid()));

CREATE POLICY "Direct managers update subordinate corrections"
ON public.attendance_corrections FOR UPDATE TO authenticated
USING (is_direct_manager_of(employee_id, auth.uid()));

CREATE POLICY "Payroll views approved corrections"
ON public.attendance_corrections FOR SELECT TO authenticated
USING (
  is_payroll(auth.uid())
  AND status = 'approved'
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Admins manage company corrections"
ON public.attendance_corrections FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============================================
-- 3. Update RLS for employees (add operations)
-- ============================================
DROP POLICY IF EXISTS "Admins and IT view company employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can delete company employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can insert company employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can update company employees" ON public.employees;

CREATE POLICY "Staff view company employees"
ON public.employees FOR SELECT TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role)
   OR has_role(auth.uid(), 'it_manager'::app_role)
   OR is_operations(auth.uid())
   OR is_payroll(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Direct managers view subordinate employees"
ON public.employees FOR SELECT TO authenticated
USING (is_direct_manager_of(id, auth.uid()));

CREATE POLICY "Admins and Operations insert company employees"
ON public.employees FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()))
  AND company_id IS NOT NULL
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Admins and Operations update company employees"
ON public.employees FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Admins and Operations delete company employees"
ON public.employees FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============================================
-- 4. Update RLS for assets (add operations)
-- ============================================
DROP POLICY IF EXISTS "Admins can delete company assets" ON public.assets;
DROP POLICY IF EXISTS "Admins can insert company assets" ON public.assets;
DROP POLICY IF EXISTS "Admins can update company assets" ON public.assets;

CREATE POLICY "Admins and Operations delete company assets"
ON public.assets FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Admins and Operations insert company assets"
ON public.assets FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Admins and Operations update company assets"
ON public.assets FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============================================
-- 5. Update RLS for asset_categories (add operations)
-- ============================================
DROP POLICY IF EXISTS "Admins manage company categories" ON public.asset_categories;

CREATE POLICY "Admins and Operations manage company categories"
ON public.asset_categories FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============================================
-- 6. Update RLS for category_fields (add operations)
-- ============================================
DROP POLICY IF EXISTS "Admins manage company fields" ON public.category_fields;

CREATE POLICY "Admins and Operations manage company fields"
ON public.category_fields FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============================================
-- 7. Update RLS for it_tickets (add operations)
-- ============================================
DROP POLICY IF EXISTS "Admins and IT manage company tickets" ON public.it_tickets;

CREATE POLICY "Staff manage company tickets"
ON public.it_tickets FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============================================
-- 8. Update RLS for digital_access (add operations)
-- ============================================
DROP POLICY IF EXISTS "Admins and IT manage company digital access" ON public.digital_access;

CREATE POLICY "Staff manage company digital access"
ON public.digital_access FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============================================
-- 9. Update RLS for activity_log (add operations)
-- ============================================
DROP POLICY IF EXISTS "Admins and IT insert company activity log" ON public.activity_log;

CREATE POLICY "Staff insert company activity log"
ON public.activity_log FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============================================
-- 10. Update RLS for payslips (add payroll, remove it_manager)
-- ============================================
DROP POLICY IF EXISTS "Staff insert company payslips" ON public.payslips;
DROP POLICY IF EXISTS "Staff update company payslips" ON public.payslips;
DROP POLICY IF EXISTS "Staff view company payslips" ON public.payslips;

CREATE POLICY "Payroll staff view company payslips"
ON public.payslips FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR ((has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()))
      AND company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Payroll staff insert company payslips"
ON public.payslips FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Payroll staff update company payslips"
ON public.payslips FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============================================
-- 11. Update RLS for payslip_batches (add payroll)
-- ============================================
DROP POLICY IF EXISTS "Staff insert company payslip batches" ON public.payslip_batches;
DROP POLICY IF EXISTS "Staff update company payslip batches" ON public.payslip_batches;
DROP POLICY IF EXISTS "Staff view company payslip batches" ON public.payslip_batches;

CREATE POLICY "Payroll staff view company payslip batches"
ON public.payslip_batches FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR ((has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()))
      AND company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Payroll staff insert company payslip batches"
ON public.payslip_batches FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Payroll staff update company payslip batches"
ON public.payslip_batches FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============================================
-- 12. Update RLS for attendance_records (add payroll explicit)
-- ============================================
-- existing "Users view company attendance" already covers payroll if they have company access.
-- No change needed since payroll users will have user_company_access entries.

-- ============================================
-- 13. Add payroll select policy on leave_requests
-- ============================================
CREATE POLICY "Payroll views approved leave and all sick"
ON public.leave_requests FOR SELECT TO authenticated
USING (
  is_payroll(auth.uid())
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  AND (status = 'approved'::leave_request_status OR request_type = 'sick'::leave_request_type)
);

CREATE POLICY "Payroll updates payroll_notified_at"
ON public.leave_requests FOR UPDATE TO authenticated
USING (
  is_payroll(auth.uid())
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

-- ============================================
-- 14. Update RLS for user_roles (operations can manage non-sensitive roles)
-- ============================================
DROP POLICY IF EXISTS "Admins can insert company user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update company user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete company user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view company user roles" ON public.user_roles;

CREATE POLICY "Staff view company user roles"
ON public.user_roles FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    (has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
);

CREATE POLICY "Staff insert company user roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'super_admin'::app_role
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
  OR (
    is_operations(auth.uid())
    AND role NOT IN ('super_admin'::app_role, 'admin'::app_role, 'payroll'::app_role)
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
);

CREATE POLICY "Staff update company user roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
  OR (
    is_operations(auth.uid())
    AND role NOT IN ('super_admin'::app_role, 'admin'::app_role, 'payroll'::app_role)
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role) AND role <> 'super_admin'::app_role)
  OR (is_operations(auth.uid()) AND role NOT IN ('super_admin'::app_role, 'admin'::app_role, 'payroll'::app_role))
);

CREATE POLICY "Staff delete company user roles"
ON public.user_roles FOR DELETE TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'super_admin'::app_role
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
  OR (
    is_operations(auth.uid())
    AND role NOT IN ('super_admin'::app_role, 'admin'::app_role, 'payroll'::app_role)
    AND EXISTS (
      SELECT 1 FROM user_company_access uca1
      JOIN user_company_access uca2 ON uca1.company_id = uca2.company_id
      WHERE uca1.user_id = auth.uid() AND uca2.user_id = user_roles.user_id
    )
  )
);

-- ============================================
-- 15. Auto-approve sick leave trigger
-- ============================================
CREATE OR REPLACE FUNCTION public.auto_approve_sick_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.request_type = 'sick'::leave_request_type AND NEW.status = 'pending'::leave_request_status THEN
    NEW.status := 'approved'::leave_request_status;
    NEW.reviewed_at := now();
    NEW.manager_notified_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_approve_sick_leave_trigger ON public.leave_requests;
CREATE TRIGGER auto_approve_sick_leave_trigger
BEFORE INSERT ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.auto_approve_sick_leave();
CREATE TABLE public.attendance_punches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  employee_id uuid,
  employee_code_raw text NOT NULL,
  punch_at timestamptz NOT NULL,
  direction text NOT NULL DEFAULT 'unknown',
  source text NOT NULL DEFAULT 'clock',
  status text NOT NULL DEFAULT 'pending',
  raw_payload jsonb,
  processed_at timestamptz,
  processed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendance_punches_company_emp_time ON public.attendance_punches(company_id, employee_id, punch_at);
CREATE INDEX idx_attendance_punches_company_status ON public.attendance_punches(company_id, status);
CREATE INDEX idx_attendance_punches_code ON public.attendance_punches(company_id, employee_code_raw);

ALTER TABLE public.attendance_punches ENABLE ROW LEVEL SECURITY;

-- Payroll/admin/operations of the company can manage all punches
CREATE POLICY "Payroll staff manage company punches"
ON public.attendance_punches
FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
);

-- Employees view their own punches
CREATE POLICY "Employees view own punches"
ON public.attendance_punches
FOR SELECT
TO authenticated
USING (
  employee_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = attendance_punches.employee_id AND e.linked_user_id = auth.uid())
);
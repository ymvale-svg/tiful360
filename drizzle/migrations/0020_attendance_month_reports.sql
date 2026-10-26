CREATE TABLE public.attendance_month_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz,
  sent_by uuid,
  employee_confirmed_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_month_reports TO authenticated;
GRANT ALL ON public.attendance_month_reports TO service_role;
ALTER TABLE public.attendance_month_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll staff manage month reports" ON public.attendance_month_reports
FOR ALL TO authenticated
USING ((public.is_payroll(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role)) AND (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid()))))
WITH CHECK ((public.is_payroll(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role)) AND (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid()))));

CREATE POLICY "Employees view own month reports" ON public.attendance_month_reports
FOR SELECT TO authenticated USING (public.is_my_employee_record(employee_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.confirm_my_attendance_month(_month text)
RETURNS public.attendance_month_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_emp public.employees; v_row public.attendance_month_reports;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_emp FROM public.employees WHERE linked_user_id = auth.uid() LIMIT 1;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'לא נמצא כרטיס עובד'; END IF;
  INSERT INTO public.attendance_month_reports (company_id, employee_id, month, status, employee_confirmed_at)
  VALUES (v_emp.company_id, v_emp.id, _month, 'employee_confirmed', now())
  ON CONFLICT (employee_id, month) DO UPDATE
    SET status = CASE WHEN attendance_month_reports.status = 'approved' THEN 'approved' ELSE 'employee_confirmed' END,
        employee_confirmed_at = now(), updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END; $$;
GRANT EXECUTE ON FUNCTION public.confirm_my_attendance_month(text) TO authenticated;
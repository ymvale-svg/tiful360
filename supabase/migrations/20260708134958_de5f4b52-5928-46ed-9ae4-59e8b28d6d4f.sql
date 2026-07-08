CREATE TABLE IF NOT EXISTS public.attendance_unmatched_alerts (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_code_raw text NOT NULL,
  alert_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, employee_code_raw, alert_date)
);

GRANT SELECT, INSERT ON public.attendance_unmatched_alerts TO authenticated;
GRANT ALL ON public.attendance_unmatched_alerts TO service_role;

ALTER TABLE public.attendance_unmatched_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll/admin view unmatched alerts"
ON public.attendance_unmatched_alerts FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR ((public.has_role(auth.uid(),'admin'::app_role) OR public.is_payroll(auth.uid()))
      AND company_id IN (SELECT public.user_company_ids(auth.uid())))
);
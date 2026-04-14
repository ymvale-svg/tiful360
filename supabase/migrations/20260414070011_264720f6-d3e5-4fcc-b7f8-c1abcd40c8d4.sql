
CREATE TABLE public.attendance_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  check_in time,
  check_out time,
  source text NOT NULL DEFAULT 'משרד',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view company attendance" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())));

CREATE POLICY "Admins and IT manage attendance" ON public.attendance_records
  FOR ALL TO authenticated
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role))
    AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
  );

CREATE INDEX idx_attendance_employee ON public.attendance_records(employee_id, date DESC);

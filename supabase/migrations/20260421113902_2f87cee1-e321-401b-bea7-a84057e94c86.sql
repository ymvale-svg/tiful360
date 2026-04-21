DROP INDEX IF EXISTS public.payslips_employee_period_uniq;
ALTER TABLE public.payslips
  ADD CONSTRAINT payslips_employee_period_uniq
  UNIQUE (employee_id, period_year, period_month);
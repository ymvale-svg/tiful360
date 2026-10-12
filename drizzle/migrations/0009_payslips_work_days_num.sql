ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS work_days_num numeric;
UPDATE public.payslips SET work_days_num = work_days WHERE work_days IS NOT NULL AND work_days_num IS NULL;
COMMENT ON COLUMN public.payslips.work_days IS 'DEPRECATED: replaced by work_days_num (supports fractional days)';
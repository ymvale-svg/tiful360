-- Add new id_number_detected column on payslips
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS id_number_detected text;
CREATE INDEX IF NOT EXISTS idx_payslips_id_number_detected ON public.payslips(company_id, id_number_detected);

-- Drop legacy michpal indexes/columns
DROP INDEX IF EXISTS idx_payslips_michpal_code_detected;
ALTER TABLE public.payslips  DROP COLUMN IF EXISTS michpal_code_detected;
ALTER TABLE public.employees DROP COLUMN IF EXISTS michpal_code;
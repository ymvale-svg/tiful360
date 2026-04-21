ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS source_pdf_url text,
  ADD COLUMN IF NOT EXISTS page_indices integer[];
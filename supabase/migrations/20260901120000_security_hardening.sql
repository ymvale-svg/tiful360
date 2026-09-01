-- ============================================================
-- Security hardening — 2026-09-01
--
-- 1. Return tax-forms-101 / handover-forms to private buckets.
-- 2. Stop employees reading the shared payslip batch PDF.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Private buckets
--
-- 20260421151514 set these public so getPublicUrl() links would open.
-- A public bucket is served from /storage/v1/object/public/<bucket>/<path>
-- with no auth and no RLS, which bypassed every storage policy below —
-- including the per-company isolation added in 20260506145834 — and made
-- the short-lived signed URL from tax-form-101-signed-url pointless.
-- All call sites now use createSignedUrl() instead.
-- ------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id IN ('tax-forms-101', 'handover-forms');


-- ------------------------------------------------------------
-- 2. Payslips: never hand an employee the shared source PDF
--
-- split-payslips uploads the whole submitted batch to
--   <company>/<period>/_source_<batch>.pdf
-- and then writes one row per employee. When the per-employee split
-- failed (upload error or a pdf-lib exception), the row fell back to
--   pdf_url = sourcePath
-- and the old policy — which only asked that p.pdf_url = objects.name —
-- then authorised that employee to read the batch file containing every
-- colleague's payslip. EmployeePayslipsTab opened it for them directly.
--
-- Two independent guards, so neither alone has to be perfect:
--   a. the object must not be a _source_ batch file
--   b. the row's pdf_url must differ from its own source_pdf_url
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Employees read own payslips storage" ON storage.objects;

CREATE POLICY "Employees read own payslips storage"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payslips'
  AND strpos(name, '/_source_') = 0
  AND EXISTS (
    SELECT 1
    FROM public.payslips p
    JOIN public.employees e ON e.id = p.employee_id
    WHERE p.pdf_url = storage.objects.name
      AND p.pdf_url IS DISTINCT FROM p.source_pdf_url
      AND e.linked_user_id = auth.uid()
  )
);

-- Repair rows already pointing at the shared batch file. Marking them
-- 'failed' puts them in the same state the split-failure path now writes,
-- so payroll can re-run the split from the batch screen.
UPDATE public.payslips
SET pdf_url = NULL,
    extraction_status = 'failed',
    extraction_notes = COALESCE(extraction_notes || ' | ', '')
      || 'pdf_url pointed at the shared batch source; cleared 2026-09-01, re-split required'
WHERE pdf_url IS NOT NULL
  AND pdf_url = source_pdf_url;

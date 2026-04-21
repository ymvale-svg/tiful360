
-- 1) Make tax-forms-101 bucket public so signed PDF URLs work for employees and payroll downloads
UPDATE storage.buckets SET public = true WHERE id = 'tax-forms-101';

-- 2) Make handover-forms bucket public too (same situation: getPublicUrl is used everywhere)
UPDATE storage.buckets SET public = true WHERE id = 'handover-forms';

-- 3) Allow authenticated users to upload to tax-forms-101 (for the sign flow + admin)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Public read tax-forms-101') THEN
    CREATE POLICY "Public read tax-forms-101" ON storage.objects FOR SELECT USING (bucket_id = 'tax-forms-101');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Auth upload tax-forms-101') THEN
    CREATE POLICY "Auth upload tax-forms-101" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tax-forms-101');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Anon upload tax-forms-101') THEN
    -- token-based public sign flow needs anon insert
    CREATE POLICY "Anon upload tax-forms-101" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'tax-forms-101');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Auth update tax-forms-101') THEN
    CREATE POLICY "Auth update tax-forms-101" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'tax-forms-101');
  END IF;
END $$;

-- 4) Add FK from tax_form_101.employee_id to employees(id) so PostgREST joins work
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tax_form_101_employee_id_fkey'
      AND table_name = 'tax_form_101'
  ) THEN
    ALTER TABLE public.tax_form_101
      ADD CONSTRAINT tax_form_101_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $$;

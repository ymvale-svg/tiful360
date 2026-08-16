-- ========== 1. employee_documents ==========
CREATE TABLE IF NOT EXISTS public.employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  company_id UUID NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'other',
  document_label TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  expiry_date DATE,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee ON public.employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_company ON public.employee_documents(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View company employee documents" ON public.employee_documents;
CREATE POLICY "View company employee documents"
  ON public.employee_documents FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR is_my_employee_record(employee_id, auth.uid())
    OR (
      company_id IN (SELECT user_company_ids(auth.uid()))
      AND (
        has_role(auth.uid(),'admin'::app_role)
        OR has_role(auth.uid(),'it_manager'::app_role)
        OR has_role(auth.uid(),'hr'::app_role)
        OR is_payroll(auth.uid())
        OR is_operations(auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Staff manage employee documents" ON public.employee_documents;
CREATE POLICY "Staff manage employee documents"
  ON public.employee_documents FOR ALL TO authenticated
  USING (
    (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
    AND (
      has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'it_manager'::app_role)
      OR has_role(auth.uid(),'hr'::app_role)
      OR is_payroll(auth.uid())
      OR is_operations(auth.uid())
    )
  )
  WITH CHECK (
    (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
    AND (
      has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'it_manager'::app_role)
      OR has_role(auth.uid(),'hr'::app_role)
      OR is_payroll(auth.uid())
      OR is_operations(auth.uid())
    )
  );

-- ========== 2. storage policies ==========
DROP POLICY IF EXISTS "Company users read employee-documents" ON storage.objects;
CREATE POLICY "Company users read employee-documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (
      is_super_admin(auth.uid())
      OR ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Staff write employee-documents" ON storage.objects;
CREATE POLICY "Staff write employee-documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND (
      has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'it_manager'::app_role)
      OR has_role(auth.uid(),'hr'::app_role)
      OR is_payroll(auth.uid())
      OR is_operations(auth.uid())
    )
    AND (
      is_super_admin(auth.uid())
      OR ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Staff delete employee-documents" ON storage.objects;
CREATE POLICY "Staff delete employee-documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (
      has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'it_manager'::app_role)
      OR has_role(auth.uid(),'hr'::app_role)
      OR is_payroll(auth.uid())
      OR is_operations(auth.uid())
    )
    AND (
      is_super_admin(auth.uid())
      OR ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid()))
    )
  );

-- ========== 3. offboarding tracking columns ==========
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS end_date_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offboarding_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS access_revoked_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.employees_track_end_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.end_date IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.end_date IS DISTINCT FROM NEW.end_date) THEN
    NEW.end_date_recorded_at := now();
  ELSIF NEW.end_date IS NULL THEN
    NEW.end_date_recorded_at := NULL;
    NEW.access_revoked_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_track_end_date ON public.employees;
CREATE TRIGGER trg_employees_track_end_date
  BEFORE INSERT OR UPDATE OF end_date ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.employees_track_end_date();

UPDATE public.employees
SET end_date_recorded_at = COALESCE(end_date_recorded_at, updated_at)
WHERE end_date IS NOT NULL AND end_date_recorded_at IS NULL;

-- ========== 4. finalize expired offboarding ==========
CREATE OR REPLACE FUNCTION public.finalize_expired_offboarding()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp RECORD;
  cnt INTEGER := 0;
  snap JSONB;
BEGIN
  FOR emp IN
    SELECT * FROM public.employees
    WHERE end_date IS NOT NULL
      AND end_date < CURRENT_DATE
      AND (status <> 'inactive' OR access_revoked_at IS NULL)
  LOOP
    SELECT jsonb_build_object(
      'assets', COALESCE(jsonb_agg(jsonb_build_object(
        'asset_code', a.asset_code,
        'asset_name', a.asset_name,
        'category', c.category_name,
        'domain', c.protocol_type
      )) FILTER (WHERE a.id IS NOT NULL), '[]'::jsonb),
      'revoked_at', now()
    )
    INTO snap
    FROM public.assets a
    JOIN public.asset_categories c ON c.id = a.category_id
    WHERE a.current_owner_id = emp.id;

    UPDATE public.assets a
    SET status = 'in_repair'
    FROM public.asset_categories c
    WHERE c.id = a.category_id
      AND a.current_owner_id = emp.id
      AND (c.protocol_type = 'digital' OR c.prefix = 'DACC');

    UPDATE public.assets a
    SET current_owner_id = NULL, status = 'in_stock'
    FROM public.asset_categories c
    WHERE c.id = a.category_id
      AND a.current_owner_id = emp.id
      AND NOT (c.protocol_type = 'digital' OR c.prefix = 'DACC');

    UPDATE public.employees
    SET status = 'inactive',
        access_revoked_at = now(),
        offboarding_snapshot = COALESCE(offboarding_snapshot, snap)
    WHERE id = emp.id;

    INSERT INTO public.activity_log (company_id, employee_id, action, details, entity_type, entity_id)
    VALUES (
      emp.company_id,
      emp.id,
      'ניתוק אוטומטי בתום תאריך העזיבה',
      'הגישה למערכת נחסמה, הציוד הוחזר למלאי והגישות הדיגיטליות הושהו.',
      'employee',
      emp.id
    );

    cnt := cnt + 1;
  END LOOP;

  RETURN cnt;
END;
$$;

-- ========== 5. access check for current user ==========
CREATE OR REPLACE FUNCTION public.my_access_blocked()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.linked_user_id = auth.uid()
      AND e.end_date IS NOT NULL
      AND e.end_date < CURRENT_DATE
  )
  AND NOT public.is_super_admin(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.my_access_blocked() TO authenticated;

-- ========== 6. daily cron ==========
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'finalize-expired-offboarding';
SELECT cron.schedule(
  'finalize-expired-offboarding',
  '15 0 * * *',
  $$ SELECT public.finalize_expired_offboarding(); $$
);
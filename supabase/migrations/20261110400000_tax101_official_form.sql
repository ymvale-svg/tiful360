-- Form 101 on the official 0101/130 template:
--   * payroll settings for filling the form (employer details, defaults, edit policy)
--   * employee fields the form asks for that the card did not store yet
--   * one context function that returns everything the auto-fill needs, for the
--     signed-in employee and for the e-mailed token link alike
--   * one atomic submit that signs the form and (optionally) copies the employee's
--     corrections back to the employee card and children list

-- ── Employee fields used by the form ──────────────────────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS passport_number text,
  ADD COLUMN IF NOT EXISTS health_fund_name text,
  ADD COLUMN IF NOT EXISTS kibbutz_member text;

ALTER TABLE public.tax_form_101
  ADD COLUMN IF NOT EXISTS template_version text;

-- ── Payroll settings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tax101_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  employer_name text NOT NULL DEFAULT '',
  employer_address text NOT NULL DEFAULT '',
  employer_phone text NOT NULL DEFAULT '',
  employer_tax_file_number text NOT NULL DEFAULT ''
    CHECK (employer_tax_file_number = '' OR employer_tax_file_number ~ '^9[0-9]{8}$'),
  default_income_type text NOT NULL DEFAULT 'monthly'
    CHECK (default_income_type IN ('monthly','monthly_additional','partial','daily','pension','scholarship')),
  allow_edit_prefilled boolean NOT NULL DEFAULT true,
  write_back_to_employee boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tax101_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payroll staff view tax101 settings" ON public.tax101_settings;
CREATE POLICY "Payroll staff view tax101 settings"
ON public.tax101_settings FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR ((has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
      AND company_id IN (SELECT user_company_ids(auth.uid())))
);

DROP POLICY IF EXISTS "Payroll staff insert tax101 settings" ON public.tax101_settings;
CREATE POLICY "Payroll staff insert tax101 settings"
ON public.tax101_settings FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()) OR is_super_admin(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

DROP POLICY IF EXISTS "Payroll staff update tax101 settings" ON public.tax101_settings;
CREATE POLICY "Payroll staff update tax101 settings"
ON public.tax101_settings FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()) OR is_super_admin(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()) OR is_super_admin(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

DROP TRIGGER IF EXISTS trg_tax101_settings_updated_at ON public.tax101_settings;
CREATE TRIGGER trg_tax101_settings_updated_at
BEFORE UPDATE ON public.tax101_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Authorization helper: who may open this form? ─────────────────────────────
-- Token callers: a valid, unexpired access token for exactly this form.
-- Signed-in callers: the employee the form belongs to, or payroll staff of its company.
CREATE OR REPLACE FUNCTION public.tax101_form_for_caller(_form_id uuid, _token uuid, _for_submit boolean)
RETURNS public.tax_form_101
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.tax_form_101;
  v_uid uuid := auth.uid();
BEGIN
  IF _token IS NOT NULL THEN
    SELECT * INTO v_form FROM public.tax_form_101
    WHERE access_token = _token
      AND (_form_id IS NULL OR id = _form_id)
      AND (token_expires_at IS NULL OR token_expires_at > now())
    LIMIT 1;
    RETURN v_form;
  END IF;

  IF v_uid IS NULL OR _form_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_form FROM public.tax_form_101 WHERE id = _form_id;
  IF v_form.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF is_my_employee_record(v_form.employee_id, v_uid) THEN
    RETURN v_form;
  END IF;

  -- Staff may view the context, but only the employee signs.
  IF NOT _for_submit AND (
    is_super_admin(v_uid)
    OR ((has_role(v_uid, 'admin'::app_role) OR is_payroll(v_uid) OR is_hr(v_uid))
        AND v_form.company_id IN (SELECT user_company_ids(v_uid)))
  ) THEN
    RETURN v_form;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tax101_form_for_caller(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ── Everything the auto-fill needs ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_tax_form_101_context(_form_id uuid DEFAULT NULL, _token uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.tax_form_101;
  v_emp public.employees;
  v_company public.companies;
  v_settings public.tax101_settings;
  v_se public.sub_employers;
  v_dependents jsonb;
BEGIN
  v_form := public.tax101_form_for_caller(_form_id, _token, false);
  IF v_form.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_emp FROM public.employees WHERE id = v_form.employee_id;
  SELECT * INTO v_company FROM public.companies WHERE id = v_form.company_id;
  SELECT * INTO v_settings FROM public.tax101_settings WHERE company_id = v_form.company_id;
  IF COALESCE(v_form.sub_employer_id, v_emp.sub_employer_id) IS NOT NULL THEN
    SELECT * INTO v_se FROM public.sub_employers
    WHERE id = COALESCE(v_form.sub_employer_id, v_emp.sub_employer_id)
      AND company_id = v_form.company_id;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'full_name', d.full_name,
           'id_number', d.id_number,
           'birth_date', d.birth_date,
           'is_in_custody', d.is_in_custody,
           'receives_allowance', d.receives_allowance
         ) ORDER BY d.birth_date NULLS LAST), '[]'::jsonb)
  INTO v_dependents
  FROM public.employee_dependents d
  WHERE d.employee_id = v_emp.id;

  RETURN jsonb_build_object(
    'form', jsonb_build_object(
      'id', v_form.id,
      'tax_year', v_form.tax_year,
      'status', v_form.status,
      'form_data', v_form.form_data,
      'pdf_url', v_form.pdf_url,
      'signed_at', v_form.signed_at,
      'company_id', v_form.company_id,
      'template_version', v_form.template_version
    ),
    'company', jsonb_build_object('name', v_company.name, 'logo_url', v_company.logo_url),
    'employer', jsonb_build_object(
      'name', COALESCE(NULLIF(v_se.legal_name, ''), NULLIF(v_settings.employer_name, ''), v_company.name, ''),
      'address', COALESCE(
        NULLIF(concat_ws(', ', NULLIF(v_se.address, ''), NULLIF(v_se.city, '')), ''),
        NULLIF(v_settings.employer_address, ''), ''),
      'phone', COALESCE(NULLIF(v_se.phone, ''), NULLIF(v_settings.employer_phone, ''), ''),
      'tax_file_number', COALESCE(NULLIF(v_se.withholding_file_number, ''), NULLIF(v_settings.employer_tax_file_number, ''), '')
    ),
    'settings', jsonb_build_object(
      'default_income_type', COALESCE(v_settings.default_income_type, 'monthly'),
      'allow_edit_prefilled', COALESCE(v_settings.allow_edit_prefilled, true),
      'write_back_to_employee', COALESCE(v_settings.write_back_to_employee, true)
    ),
    'employee', jsonb_build_object(
      'id', v_emp.id,
      'company_id', v_emp.company_id,
      'sub_employer_id', v_emp.sub_employer_id,
      'full_name', v_emp.full_name,
      'employee_code', v_emp.employee_code,
      'id_number', v_emp.id_number,
      'passport_number', v_emp.passport_number,
      'gender', v_emp.gender,
      'birth_date', v_emp.birth_date,
      'country_of_birth', v_emp.country_of_birth,
      'aliyah_date', v_emp.aliyah_date,
      'phone', v_emp.phone,
      'email', v_emp.email,
      'street', v_emp.street,
      'house_number', v_emp.house_number,
      'city', v_emp.city,
      'postal_code', v_emp.postal_code,
      'po_box', v_emp.po_box,
      'marital_status', v_emp.marital_status,
      'is_israeli_resident', v_emp.is_israeli_resident,
      'health_fund_member', v_emp.health_fund_member,
      'health_fund_name', v_emp.health_fund_name,
      'kibbutz_member', v_emp.kibbutz_member,
      'start_date', v_emp.start_date
    ),
    'dependents', v_dependents
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tax_form_101_context(uuid, uuid) TO anon, authenticated;

-- The token page keeps its old entry point; it now returns the same context.
CREATE OR REPLACE FUNCTION public.get_tax_form_101_context_by_token(_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _token IS NULL THEN NULL ELSE public.get_tax_form_101_context(NULL, _token) END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tax_form_101_context_by_token(uuid) TO anon, authenticated;

-- ── Atomic sign + write-back ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_tax_form_101(
  _form_id uuid,
  _token uuid,
  _form_data jsonb,
  _signature text,
  _pdf_url text,
  _template_version text
) RETURNS public.tax_form_101
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.tax_form_101;
  v_row public.tax_form_101;
  v_emp public.employees;
  v_write_back boolean;
  v_phone text;
  v_child jsonb;
  v_child_id text;
  v_child_birth date;
  v_existing uuid;
BEGIN
  v_form := public.tax101_form_for_caller(_form_id, _token, true);
  IF v_form.id IS NULL THEN
    RAISE EXCEPTION 'form not found or not yours' USING ERRCODE = '42501';
  END IF;
  IF v_form.status <> 'pending' THEN
    RAISE EXCEPTION 'form already signed' USING ERRCODE = '22023';
  END IF;
  IF _signature IS NULL OR _signature NOT LIKE 'data:image/%' THEN
    RAISE EXCEPTION 'signature required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(_form_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'form data required' USING ERRCODE = '22023';
  END IF;
  -- The PDF must be this form's own upload, never another file in the bucket.
  IF _pdf_url IS NULL OR _pdf_url NOT LIKE (v_form.company_id::text || '/' || v_form.id::text || '-%') THEN
    RAISE EXCEPTION 'invalid pdf path' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tax_form_101
  SET form_data = _form_data,
      signature_data = _signature,
      pdf_url = _pdf_url,
      template_version = _template_version,
      status = 'signed',
      signed_at = now()
  WHERE id = v_form.id AND status = 'pending'
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'form already signed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_emp FROM public.employees WHERE id = v_form.employee_id;
  SELECT COALESCE((SELECT write_back_to_employee FROM public.tax101_settings WHERE company_id = v_form.company_id), true)
  INTO v_write_back;

  IF v_write_back THEN
    v_phone := COALESCE(NULLIF(btrim(_form_data->>'mobile_phone'), ''), NULLIF(btrim(_form_data->>'phone'), ''));
    UPDATE public.employees e SET
      gender = COALESCE(NULLIF(_form_data->>'gender', ''), e.gender),
      birth_date = COALESCE(CASE WHEN _form_data->>'birth_date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (_form_data->>'birth_date')::date END, e.birth_date),
      aliyah_date = COALESCE(CASE WHEN _form_data->>'aliyah_date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (_form_data->>'aliyah_date')::date END, e.aliyah_date),
      passport_number = COALESCE(NULLIF(btrim(_form_data->>'passport_number'), ''), e.passport_number),
      street = COALESCE(NULLIF(btrim(_form_data->>'street'), ''), e.street),
      house_number = COALESCE(NULLIF(btrim(_form_data->>'house_number'), ''), e.house_number),
      city = COALESCE(NULLIF(btrim(_form_data->>'city'), ''), e.city),
      postal_code = COALESCE(NULLIF(btrim(_form_data->>'postal_code'), ''), e.postal_code),
      marital_status = COALESCE(NULLIF(_form_data->>'marital_status', ''), e.marital_status),
      kibbutz_member = COALESCE(NULLIF(_form_data->>'kibbutz_member', ''), e.kibbutz_member),
      health_fund_name = COALESCE(NULLIF(btrim(_form_data->>'health_fund_name'), ''), e.health_fund_name),
      is_israeli_resident = COALESCE((_form_data->>'is_israeli_resident')::boolean, e.is_israeli_resident),
      health_fund_member = COALESCE((_form_data->>'health_fund_member')::boolean, e.health_fund_member),
      phone = COALESCE(v_phone, e.phone)
    WHERE e.id = v_emp.id;

    -- Children: update a known child (same ID number, or same name + birth date), add new ones.
    FOR v_child IN SELECT * FROM jsonb_array_elements(COALESCE(_form_data->'dependents', '[]'::jsonb))
    LOOP
      CONTINUE WHEN NULLIF(btrim(v_child->>'full_name'), '') IS NULL;
      v_child_id := NULLIF(regexp_replace(COALESCE(v_child->>'id_number', ''), '\D', '', 'g'), '');
      v_child_birth := CASE WHEN v_child->>'birth_date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (v_child->>'birth_date')::date END;

      SELECT d.id INTO v_existing FROM public.employee_dependents d
      WHERE d.employee_id = v_emp.id
        AND (
          (v_child_id IS NOT NULL AND regexp_replace(COALESCE(d.id_number, ''), '\D', '', 'g') = v_child_id)
          OR (d.full_name = btrim(v_child->>'full_name') AND d.birth_date IS NOT DISTINCT FROM v_child_birth)
        )
      LIMIT 1;

      IF v_existing IS NOT NULL THEN
        UPDATE public.employee_dependents SET
          full_name = btrim(v_child->>'full_name'),
          id_number = COALESCE(v_child_id, id_number),
          birth_date = COALESCE(v_child_birth, birth_date),
          is_in_custody = COALESCE((v_child->>'is_in_custody')::boolean, is_in_custody),
          receives_allowance = COALESCE((v_child->>'receives_allowance')::boolean, receives_allowance)
        WHERE id = v_existing;
      ELSE
        INSERT INTO public.employee_dependents (employee_id, company_id, full_name, id_number, birth_date, is_in_custody, receives_allowance)
        VALUES (
          v_emp.id, v_emp.company_id, btrim(v_child->>'full_name'), v_child_id, v_child_birth,
          COALESCE((v_child->>'is_in_custody')::boolean, true),
          COALESCE((v_child->>'receives_allowance')::boolean, false)
        );
      END IF;
      v_existing := NULL;
    END LOOP;
  END IF;

  INSERT INTO public.activity_log (company_id, employee_id, entity_id, entity_type, action, details, performed_by, performed_by_name)
  VALUES (
    v_form.company_id, v_form.employee_id, v_form.id, 'tax_form_101',
    'מילוי וחתימה על טופס 101 לשנת ' || v_form.tax_year,
    CASE WHEN v_write_back THEN 'הטופס נחתם דיגיטלית; פרטי העובד עודכנו לפי הטופס' ELSE 'הטופס נחתם דיגיטלית' END,
    auth.uid(),
    v_emp.full_name
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_tax_form_101(uuid, uuid, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_tax_form_101(uuid, uuid, jsonb, text, text, text) TO anon, authenticated;

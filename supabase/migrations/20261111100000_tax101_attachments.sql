-- Form 101 attachments: documents the form asks for (ID copy, credit approvals …).
-- Files are uploaded to tax-forms-101 under <company>/<form>-att-…; the signed form
-- records them in tax_form_101.attachments through submit_tax_form_101, which only
-- accepts files of that form's own prefix that really exist in storage.

ALTER TABLE public.tax_form_101
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.tax101_settings
  ADD COLUMN IF NOT EXISTS require_id_copy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_attachments boolean NOT NULL DEFAULT true;

-- Payroll staff may read the attachments recorded on their company's forms.
DROP POLICY IF EXISTS "Staff view company tax form attachments" ON storage.objects;
CREATE POLICY "Staff view company tax form attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tax-forms-101'
  AND EXISTS (
    SELECT 1 FROM public.tax_form_101 t
    WHERE t.attachments @> jsonb_build_array(jsonb_build_object('path', objects.name))
      AND (is_super_admin(auth.uid())
           OR ((has_role(auth.uid(), 'admin'::app_role) OR is_payroll(auth.uid()) OR is_hr(auth.uid()))
               AND t.company_id IN (SELECT user_company_ids(auth.uid()))))
  )
);

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
      'template_version', v_form.template_version,
      'attachments', COALESCE(v_form.attachments, '[]'::jsonb)
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
      'write_back_to_employee', COALESCE(v_settings.write_back_to_employee, true),
      'require_id_copy', COALESCE(v_settings.require_id_copy, false),
      'require_attachments', COALESCE(v_settings.require_attachments, true)
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

DROP FUNCTION IF EXISTS public.submit_tax_form_101(uuid, uuid, jsonb, text, text, text);

CREATE OR REPLACE FUNCTION public.submit_tax_form_101(
  _form_id uuid,
  _token uuid,
  _form_data jsonb,
  _signature text,
  _pdf_url text,
  _template_version text,
  _attachments jsonb DEFAULT '[]'::jsonb
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
  v_att jsonb;
  v_attachments jsonb := '[]'::jsonb;
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

  -- Attachments: only files this form uploaded under its own prefix, and that really exist.
  IF _attachments IS NOT NULL AND jsonb_typeof(_attachments) <> 'array' THEN
    RAISE EXCEPTION 'invalid attachments' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(COALESCE(_attachments, '[]'::jsonb)) > 20 THEN
    RAISE EXCEPTION 'too many attachments' USING ERRCODE = '22023';
  END IF;
  FOR v_att IN SELECT * FROM jsonb_array_elements(COALESCE(_attachments, '[]'::jsonb))
  LOOP
    IF jsonb_typeof(v_att) <> 'object'
       OR COALESCE(v_att->>'path', '') NOT LIKE (v_form.company_id::text || '/' || v_form.id::text || '-att-%')
       OR COALESCE(v_att->>'kind', '') NOT IN ('id_copy','passport','separated','disability','disability_comp','settlement',
                                               'immigrant','disabled_child','alimony','discharge','degree','reservist','coordination','other')
       OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'tax-forms-101' AND o.name = v_att->>'path')
    THEN
      RAISE EXCEPTION 'invalid attachment' USING ERRCODE = '22023';
    END IF;
    v_attachments := v_attachments || jsonb_build_array(jsonb_build_object(
      'kind', v_att->>'kind',
      'name', left(COALESCE(v_att->>'name', ''), 200),
      'path', v_att->>'path',
      'size', CASE WHEN jsonb_typeof(v_att->'size') = 'number' THEN v_att->'size' ELSE '0'::jsonb END,
      'uploaded_at', COALESCE(v_att->>'uploaded_at', '')
    ));
  END LOOP;

  UPDATE public.tax_form_101
  SET form_data = _form_data,
      attachments = v_attachments,
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

REVOKE ALL ON FUNCTION public.submit_tax_form_101(uuid, uuid, jsonb, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_tax_form_101(uuid, uuid, jsonb, text, text, text, jsonb) TO anon, authenticated;

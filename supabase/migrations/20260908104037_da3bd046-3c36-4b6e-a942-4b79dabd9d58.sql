CREATE OR REPLACE FUNCTION public.get_tax_form_101_context_by_token(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.tax_form_101;
  v_emp public.employees;
  v_company_name text;
  v_company_logo text;
  v_employer jsonb;
BEGIN
  IF _token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_form
  FROM public.tax_form_101
  WHERE access_token = _token
    AND (token_expires_at IS NULL OR token_expires_at > now())
  LIMIT 1;

  IF v_form.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_emp FROM public.employees WHERE id = v_form.employee_id;
  SELECT name, logo_url INTO v_company_name, v_company_logo FROM public.companies WHERE id = v_form.company_id;

  IF v_emp.sub_employer_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'name', se.legal_name,
      'tax_id', se.tax_id,
      'address', concat_ws(', ', NULLIF(se.address,''), NULLIF(se.city,'')),
      'phone', COALESCE(se.phone,'')
    ) INTO v_employer
    FROM public.sub_employers se WHERE se.id = v_emp.sub_employer_id;
  END IF;

  IF v_employer IS NULL THEN
    v_employer := jsonb_build_object('name', COALESCE(v_company_name,''), 'tax_id', '', 'address', '', 'phone', '');
  END IF;

  RETURN jsonb_build_object(
    'form', to_jsonb(v_form),
    'company', jsonb_build_object('name', v_company_name, 'logo_url', v_company_logo),
    'employer', v_employer,
    'employee', jsonb_build_object(
      'id', v_emp.id,
      'company_id', v_emp.company_id,
      'sub_employer_id', v_emp.sub_employer_id,
      'full_name', v_emp.full_name,
      'employee_code', v_emp.employee_code,
      'id_number', v_emp.id_number,
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
      'start_date', v_emp.start_date
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tax_form_101_context_by_token(uuid) TO anon, authenticated;
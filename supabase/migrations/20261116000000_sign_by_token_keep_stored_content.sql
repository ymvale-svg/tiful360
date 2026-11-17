-- ============================================================
-- Security (issue #58): signing from the link must not change the form's content.
--
-- sign_handover_form_by_token / sign_offboarding_form_by_token are open to anon
-- (anyone holding the sign link). Until now they saved the browser's
-- _form_snapshot (the whole form content), _pdf_url and _attached_url as-is, so
-- the link holder could sign a form whose content (e.g. the asset list) differs
-- from what was sent. submit_tax_form_101_by_token saved the data and signature
-- with no server-side checks.
--
-- Now:
--   * _form_snapshot is ignored (the parameter stays so existing clients keep
--     working). The content stored when the form was sent is kept; only the
--     signature is merged into it, plus signature_data, signed_at and status.
--   * _pdf_url / _attached_url must be the storage path the sign-form-upload-url
--     edge function issues for THIS form (handover-forms bucket), or the value
--     already stored, or NULL (keep).
--   * The signature must be a non-empty PNG/JPEG data URL of reasonable size.
--   * Tax form 101: basic server-side validation (required fields, Israeli ID
--     pattern + check digit, signature, PDF path of this form) before signing.
-- Latest previous definitions: 20260506145834_52eeee4e-6f77-4b57-aee7-dcea52983f81.sql
-- ============================================================

-- Internal helpers (not callable by clients) ----------------------------------

CREATE OR REPLACE FUNCTION public._is_valid_signature_data(_signature text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _signature IS NOT NULL
    AND length(_signature) BETWEEN 64 AND 1000000
    AND _signature ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$';
$$;

CREATE OR REPLACE FUNCTION public._is_valid_israeli_id(_id text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_sum int := 0;
  v_d int;
BEGIN
  IF _id IS NULL OR _id !~ '^[0-9]{9}$' THEN
    RETURN false;
  END IF;
  FOR i IN 1..9 LOOP
    v_d := substr(_id, i, 1)::int * (((i - 1) % 2) + 1);
    IF v_d > 9 THEN
      v_d := v_d - 9;
    END IF;
    v_sum := v_sum + v_d;
  END LOOP;
  RETURN v_sum % 10 = 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._is_valid_signature_data(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._is_valid_israeli_id(text) FROM PUBLIC, anon, authenticated;

-- Handover --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sign_handover_form_by_token(
  _token text,
  _signature text,
  _attached_url text,
  _pdf_url text,
  _form_snapshot jsonb  -- ignored: the stored content is kept (issue #58)
) RETURNS public.asset_handover_forms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.asset_handover_forms;
  v_row public.asset_handover_forms;
  v_prefix text;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  SELECT * INTO v_form
  FROM public.asset_handover_forms
  WHERE sign_token = _token AND status = 'pending'
  FOR UPDATE;
  IF v_form.id IS NULL THEN
    RAISE EXCEPTION 'token invalid or form not pending';
  END IF;

  IF NOT public._is_valid_signature_data(_signature) THEN
    RAISE EXCEPTION 'החתימה חסרה או לא תקינה';
  END IF;

  -- Same layout as supabase/functions/sign-form-upload-url (handover):
  --   <company>/<employee>/<asset>-<ts>.pdf
  --   <company>/<employee>/<asset>-attached-<ts>.<ext>
  v_prefix := '^' || v_form.company_id::text || '/' || v_form.employee_id::text || '/'
              || COALESCE(v_form.asset_id::text, 'null') || '-';

  IF _pdf_url IS NOT NULL
     AND _pdf_url IS DISTINCT FROM v_form.pdf_url
     AND NOT COALESCE(_pdf_url ~ (v_prefix || '[0-9]+\.pdf$'), false) THEN
    RAISE EXCEPTION 'invalid pdf path';
  END IF;

  IF _attached_url IS NOT NULL
     AND _attached_url IS DISTINCT FROM v_form.attached_document_url
     AND NOT COALESCE(_attached_url ~ (v_prefix || 'attached-[0-9]+\.[a-z0-9]+$'), false) THEN
    RAISE EXCEPTION 'invalid attachment path';
  END IF;

  UPDATE public.asset_handover_forms
  SET status = 'signed',
      signature_data = _signature,
      attached_document_url = COALESCE(_attached_url, attached_document_url),
      pdf_url = COALESCE(_pdf_url, pdf_url),
      signed_at = now(),
      form_snapshot = CASE
        WHEN form_snapshot IS NULL OR jsonb_typeof(form_snapshot) = 'object'
          THEN COALESCE(form_snapshot, '{}'::jsonb)
               || jsonb_build_object('receiver_signature', _signature, 'employee_signature', _signature)
        ELSE form_snapshot
      END
  WHERE id = v_form.id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Offboarding -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sign_offboarding_form_by_token(
  _token text,
  _signature text,
  _attached_url text,
  _pdf_url text,
  _form_snapshot jsonb  -- ignored: the stored content is kept (issue #58)
) RETURNS public.offboarding_forms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.offboarding_forms;
  v_row public.offboarding_forms;
  v_prefix text;
  v_asset_ids uuid[];
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  SELECT * INTO v_form
  FROM public.offboarding_forms
  WHERE sign_token = _token AND status = 'pending'
  FOR UPDATE;
  IF v_form.id IS NULL THEN
    RAISE EXCEPTION 'token invalid or form not pending';
  END IF;

  IF NOT public._is_valid_signature_data(_signature) THEN
    RAISE EXCEPTION 'החתימה חסרה או לא תקינה';
  END IF;

  -- Same layout as supabase/functions/sign-form-upload-url (offboarding):
  --   offboarding/<company>/<employee>/<form>-<ts>.pdf
  --   offboarding/<company>/<employee>/<form>-attached-<ts>.<ext>
  v_prefix := '^offboarding/' || v_form.company_id::text || '/' || v_form.employee_id::text || '/'
              || v_form.id::text || '-';

  IF _pdf_url IS NOT NULL
     AND _pdf_url IS DISTINCT FROM v_form.pdf_url
     AND NOT COALESCE(_pdf_url ~ (v_prefix || '[0-9]+\.pdf$'), false) THEN
    RAISE EXCEPTION 'invalid pdf path';
  END IF;

  IF _attached_url IS NOT NULL
     AND _attached_url IS DISTINCT FROM v_form.attached_document_url
     AND NOT COALESCE(_attached_url ~ (v_prefix || 'attached-[0-9]+\.[a-z0-9]+$'), false) THEN
    RAISE EXCEPTION 'invalid attachment path';
  END IF;

  UPDATE public.offboarding_forms
  SET status = 'signed',
      signature_data = _signature,
      attached_document_url = COALESCE(_attached_url, attached_document_url),
      pdf_url = COALESCE(_pdf_url, pdf_url),
      signed_at = now(),
      form_snapshot = CASE
        WHEN form_snapshot IS NULL OR jsonb_typeof(form_snapshot) = 'object'
          THEN COALESCE(form_snapshot, '{}'::jsonb)
               || jsonb_build_object('receiver_signature', _signature)
        ELSE form_snapshot
      END
  WHERE id = v_form.id
  RETURNING * INTO v_row;

  -- Return the listed assets to stock (from the stored snapshot only)
  SELECT ARRAY(
    SELECT (jsonb_array_elements(COALESCE(v_row.form_snapshot->'assets','[]'::jsonb))->>'asset_id')::uuid
  ) INTO v_asset_ids;
  IF array_length(v_asset_ids, 1) > 0 THEN
    UPDATE public.assets
    SET status = 'in_stock', current_owner_id = NULL
    WHERE id = ANY(v_asset_ids) AND company_id = v_row.company_id;
  END IF;
  RETURN v_row;
END;
$$;

-- Tax form 101 ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_tax_form_101_by_token(
  _token uuid,
  _form_data jsonb,
  _signature text,
  _pdf_url text
) RETURNS public.tax_form_101
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.tax_form_101;
  v_row public.tax_form_101;
  v_data jsonb;
  v_id text;
BEGIN
  IF _token IS NULL THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  SELECT * INTO v_form
  FROM public.tax_form_101
  WHERE access_token = _token
    AND status = 'pending'
    AND (token_expires_at IS NULL OR token_expires_at > now())
  FOR UPDATE;
  IF v_form.id IS NULL THEN
    RAISE EXCEPTION 'token invalid, expired, or form already signed';
  END IF;

  IF NOT public._is_valid_signature_data(_signature) THEN
    RAISE EXCEPTION 'החתימה חסרה או לא תקינה';
  END IF;

  v_data := COALESCE(_form_data, v_form.form_data);
  IF v_data IS NULL OR jsonb_typeof(v_data) <> 'object' THEN
    RAISE EXCEPTION 'נתוני הטופס חסרים';
  END IF;

  -- Required fields (same as the browser's validateTax101 errors)
  IF COALESCE(btrim(v_data->>'first_name'), '') = '' OR COALESCE(btrim(v_data->>'last_name'), '') = '' THEN
    RAISE EXCEPTION 'יש להזין שם פרטי ושם משפחה';
  END IF;
  v_id := btrim(COALESCE(v_data->>'id_number', ''));
  IF v_id = '' AND COALESCE(btrim(v_data->>'passport_number'), '') = '' THEN
    RAISE EXCEPTION 'יש להזין תעודת זהות או מספר דרכון';
  END IF;
  IF v_id <> '' AND NOT public._is_valid_israeli_id(v_id) THEN
    RAISE EXCEPTION 'תעודת זהות לא תקינה';
  END IF;
  IF COALESCE(btrim(v_data->>'gender'), '') = '' OR COALESCE(btrim(v_data->>'birth_date'), '') = '' THEN
    RAISE EXCEPTION 'יש להזין מין ותאריך לידה';
  END IF;
  IF COALESCE(btrim(v_data->>'city'), '') = '' OR COALESCE(btrim(v_data->>'street'), '') = '' THEN
    RAISE EXCEPTION 'יש למלא כתובת מלאה';
  END IF;
  IF COALESCE(btrim(v_data->>'marital_status'), '') = '' THEN
    RAISE EXCEPTION 'יש לבחור מצב משפחתי';
  END IF;

  -- PDF path as uploaded by Tax101Dialog (tax-forms-101 bucket):
  --   <company>/<form>-<ts>.pdf  (or anon/<form>-<ts>.pdf when the company is unknown)
  IF _pdf_url IS NOT NULL
     AND _pdf_url IS DISTINCT FROM v_form.pdf_url
     AND NOT COALESCE(_pdf_url ~ ('^(' || COALESCE(v_form.company_id::text, 'anon') || '|anon)/' || v_form.id::text || '-[0-9]+\.pdf$'), false) THEN
    RAISE EXCEPTION 'invalid pdf path';
  END IF;

  UPDATE public.tax_form_101
  SET form_data = v_data,
      signature_data = _signature,
      pdf_url = COALESCE(_pdf_url, pdf_url),
      status = 'signed',
      signed_at = now()
  WHERE id = v_form.id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Same grants as before (the functions validate the token themselves)
GRANT EXECUTE ON FUNCTION public.sign_handover_form_by_token(text, text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_offboarding_form_by_token(text, text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tax_form_101_by_token(uuid, jsonb, text, text) TO anon, authenticated;

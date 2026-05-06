
-- ============================================================
-- 1. Token-bypass RLS fix: replace permissive public policies with
--    SECURITY DEFINER RPCs that verify the actual token value.
-- ============================================================

-- Drop permissive public policies on asset_handover_forms
DROP POLICY IF EXISTS "Public read by sign token" ON public.asset_handover_forms;
DROP POLICY IF EXISTS "Public update by sign token" ON public.asset_handover_forms;

-- Drop permissive public policies on offboarding_forms
DROP POLICY IF EXISTS "Public read offboarding by sign token" ON public.offboarding_forms;
DROP POLICY IF EXISTS "Public update offboarding by sign token" ON public.offboarding_forms;

-- Drop permissive public policies on tax_form_101
DROP POLICY IF EXISTS "Public read by access token" ON public.tax_form_101;
DROP POLICY IF EXISTS "Public update by access token" ON public.tax_form_101;

-- RPC: get a handover form by sign_token (validates token == provided)
CREATE OR REPLACE FUNCTION public.get_handover_form_by_token(_token text)
RETURNS SETOF public.asset_handover_forms
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.asset_handover_forms
  WHERE sign_token = _token AND _token IS NOT NULL AND length(_token) >= 16
  LIMIT 1;
$$;

-- RPC: sign a pending handover form using the token
CREATE OR REPLACE FUNCTION public.sign_handover_form_by_token(
  _token text,
  _signature text,
  _attached_url text,
  _pdf_url text,
  _form_snapshot jsonb
) RETURNS public.asset_handover_forms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.asset_handover_forms;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;
  UPDATE public.asset_handover_forms
  SET status = 'signed',
      signature_data = _signature,
      attached_document_url = COALESCE(_attached_url, attached_document_url),
      pdf_url = COALESCE(_pdf_url, pdf_url),
      signed_at = now(),
      form_snapshot = COALESCE(_form_snapshot, form_snapshot)
  WHERE sign_token = _token AND status = 'pending'
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'token invalid or form not pending';
  END IF;
  RETURN v_row;
END;
$$;

-- RPC: get an offboarding form by sign_token
CREATE OR REPLACE FUNCTION public.get_offboarding_form_by_token(_token text)
RETURNS SETOF public.offboarding_forms
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.offboarding_forms
  WHERE sign_token = _token AND _token IS NOT NULL AND length(_token) >= 16
  LIMIT 1;
$$;

-- RPC: sign offboarding form by token
CREATE OR REPLACE FUNCTION public.sign_offboarding_form_by_token(
  _token text,
  _signature text,
  _attached_url text,
  _pdf_url text,
  _form_snapshot jsonb
) RETURNS public.offboarding_forms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.offboarding_forms;
  v_asset_ids uuid[];
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;
  UPDATE public.offboarding_forms
  SET status = 'signed',
      signature_data = _signature,
      attached_document_url = COALESCE(_attached_url, attached_document_url),
      pdf_url = COALESCE(_pdf_url, pdf_url),
      signed_at = now(),
      form_snapshot = COALESCE(_form_snapshot, form_snapshot)
  WHERE sign_token = _token AND status = 'pending'
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'token invalid or form not pending';
  END IF;
  -- Return the listed assets to stock
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

-- RPC: get tax_form_101 by access_token
CREATE OR REPLACE FUNCTION public.get_tax_form_101_by_token(_token uuid)
RETURNS SETOF public.tax_form_101
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.tax_form_101
  WHERE access_token = _token AND _token IS NOT NULL
    AND (token_expires_at IS NULL OR token_expires_at > now())
  LIMIT 1;
$$;

-- RPC: submit signed tax_form_101 by access_token
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
  v_row public.tax_form_101;
BEGIN
  IF _token IS NULL THEN
    RAISE EXCEPTION 'invalid token';
  END IF;
  UPDATE public.tax_form_101
  SET form_data = COALESCE(_form_data, form_data),
      signature_data = _signature,
      pdf_url = COALESCE(_pdf_url, pdf_url),
      status = 'signed',
      signed_at = now()
  WHERE access_token = _token
    AND status = 'pending'
    AND (token_expires_at IS NULL OR token_expires_at > now())
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'token invalid, expired, or form already signed';
  END IF;
  RETURN v_row;
END;
$$;

-- Grant execute to anon + authenticated for these token RPCs (they validate the token themselves)
GRANT EXECUTE ON FUNCTION public.get_handover_form_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_handover_form_by_token(text, text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_offboarding_form_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_offboarding_form_by_token(text, text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tax_form_101_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tax_form_101_by_token(uuid, jsonb, text, text) TO anon, authenticated;

-- ============================================================
-- 2. user_roles privilege escalation fix:
--    Restrict admins from granting payroll/it_manager unless super_admin.
-- ============================================================

DROP POLICY IF EXISTS "Staff update company user roles" ON public.user_roles;
CREATE POLICY "Staff update company user roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role) AND (role <> 'super_admin'::app_role))
  OR (is_operations(auth.uid())
      AND (role <> ALL (ARRAY['super_admin'::app_role,'admin'::app_role,'payroll'::app_role,'it_manager'::app_role,'operations'::app_role]))
      AND (user_id <> auth.uid()))
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role)
      AND (role <> ALL (ARRAY['super_admin'::app_role,'payroll'::app_role,'it_manager'::app_role])))
  OR (is_operations(auth.uid())
      AND (role <> ALL (ARRAY['super_admin'::app_role,'admin'::app_role,'payroll'::app_role,'it_manager'::app_role,'operations'::app_role]))
      AND (user_id <> auth.uid()))
);

-- ============================================================
-- 3. Storage policy tightening: company-path ownership for
--    handover-forms and tax-forms-101 buckets.
-- ============================================================

-- handover-forms: replace permissive INSERT/UPDATE/list with company-scoped checks
DROP POLICY IF EXISTS "Authenticated upload handover files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update handover files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated list handover files" ON storage.objects;

CREATE POLICY "Company staff upload handover files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'handover-forms'
  AND (is_super_admin(auth.uid())
       OR ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Company staff update handover files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'handover-forms'
  AND (is_super_admin(auth.uid())
       OR ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Company staff list handover files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'handover-forms'
  AND (is_super_admin(auth.uid())
       OR ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid())))
);

-- tax-forms-101: replace permissive INSERT/UPDATE with company-scoped checks
DROP POLICY IF EXISTS "Authenticated insert tax form files" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload tax-forms-101" ON storage.objects;
DROP POLICY IF EXISTS "Auth update tax-forms-101" ON storage.objects;
DROP POLICY IF EXISTS "Anon insert tax form files via token flow" ON storage.objects;

CREATE POLICY "Company staff upload tax form files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tax-forms-101'
  AND (is_super_admin(auth.uid())
       OR ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Company staff update tax form files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tax-forms-101'
  AND (is_super_admin(auth.uid())
       OR ((storage.foldername(name))[1])::uuid IN (SELECT user_company_ids(auth.uid())))
);

-- Anonymous token-flow uploads for tax forms now go through service-role via the
-- edge function `sign-form-upload-url`-style path; no anon INSERT policy needed.

-- ============================================================
-- 4. Revoke EXECUTE from anon on internal SECURITY DEFINER helpers
--    (keep authenticated; revoke from PUBLIC/anon).
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.is_direct_manager_of(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_my_employee_record(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_company_cascade(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_company_birthdays(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_operations(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_payroll(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.classify_existing_punches(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_company_contacts(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_live_employee_locations(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_subordinate_employee_ids(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_attendance_flow_stats(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_expiring_assets(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_company_ids(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_company_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

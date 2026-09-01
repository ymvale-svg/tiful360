-- ============================================================
-- handover-forms storage policies: handle the offboarding/ prefix
--
-- Objects in this bucket come in two shapes:
--   <company_uuid>/<...>                     handover PDFs, media, multi-handover
--   offboarding/<company_uuid>/<...>         offboarding PDFs and attachments
--
-- The policies cast (storage.foldername(name))[1] straight to uuid, so for an
-- offboarding object that is 'offboarding'::uuid — which raises
-- "invalid input syntax for type uuid" rather than returning false.
--
-- This never surfaced while the bucket was public: readers used getPublicUrl
-- and storage RLS was never consulted. Now that every reader goes through
-- createSignedUrl, the cast is reached and downloading a signed offboarding
-- protocol fails for anyone who is not a super_admin.
--
-- Fix: resolve the company segment through a helper that understands both
-- shapes and returns NULL instead of throwing on anything unexpected.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handover_object_company_id(_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN seg ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN seg::uuid
    ELSE NULL
  END
  FROM (
    SELECT CASE
      WHEN (storage.foldername(_name))[1] = 'offboarding'
        THEN (storage.foldername(_name))[2]
      ELSE (storage.foldername(_name))[1]
    END AS seg
  ) s;
$$;

COMMENT ON FUNCTION public.handover_object_company_id(text) IS
  'Company uuid owning a handover-forms object, for both <company>/... and offboarding/<company>/... paths. Returns NULL rather than raising when the segment is not a uuid.';

GRANT EXECUTE ON FUNCTION public.handover_object_company_id(text) TO authenticated;


DROP POLICY IF EXISTS "Company staff list handover files" ON storage.objects;
CREATE POLICY "Company staff list handover files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'handover-forms'
  AND (
    is_super_admin(auth.uid())
    OR public.handover_object_company_id(name) IN (SELECT user_company_ids(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Company staff upload handover files" ON storage.objects;
CREATE POLICY "Company staff upload handover files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'handover-forms'
  AND (
    is_super_admin(auth.uid())
    OR public.handover_object_company_id(name) IN (SELECT user_company_ids(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Company staff update handover files" ON storage.objects;
CREATE POLICY "Company staff update handover files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'handover-forms'
  AND (
    is_super_admin(auth.uid())
    OR public.handover_object_company_id(name) IN (SELECT user_company_ids(auth.uid()))
  )
);

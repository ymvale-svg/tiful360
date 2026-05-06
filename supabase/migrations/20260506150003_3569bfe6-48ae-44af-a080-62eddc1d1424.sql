CREATE POLICY "Anon upload tax form pdf via pending token"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'tax-forms-101'
  AND EXISTS (
    SELECT 1 FROM public.tax_form_101 t
    WHERE t.company_id::text = (storage.foldername(name))[1]
      AND t.status = 'pending'
      AND (t.token_expires_at IS NULL OR t.token_expires_at > now())
  )
);
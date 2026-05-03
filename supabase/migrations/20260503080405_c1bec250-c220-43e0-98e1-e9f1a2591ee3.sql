DROP POLICY IF EXISTS "Anon read handover files" ON storage.objects;
DROP POLICY IF EXISTS "Anon upload handover files" ON storage.objects;
DROP POLICY IF EXISTS "Anon read tax form files via token flow" ON storage.objects;
DROP POLICY IF EXISTS "Anon upload tax-forms-101" ON storage.objects;
DROP POLICY IF EXISTS "Public read tax-forms-101" ON storage.objects;
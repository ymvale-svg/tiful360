-- 0008 added the storage policies for portal-learning but never created the bucket, so every
-- guide/procedure/logo file upload failed with "Bucket not found". Private: files are served via signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('portal-learning', 'portal-learning', false)
ON CONFLICT (id) DO NOTHING;

-- Security: leave_requests.attachment_url stores the object path only.
-- Before: the app stored a 1-year signed URL for the sick note / reserve-duty
-- certificate in the private `leave-attachments` bucket, and emailed it.
-- After: the column holds the bare object path (<employee_id>/<uuid>.<ext>);
-- the app creates a 10-minute signed URL each time the file is opened.
--
-- This rewrites existing values of the form
--   https://<host>/storage/v1/object/sign/leave-attachments/<path>?token=...
-- into <path>. Only matching rows are touched, so it is idempotent
-- (rows that already hold a path no longer match). Paths containing
-- percent-encoding are left as-is; the app still accepts and re-signs them.
-- No files are moved.
--
-- NOTE (owner decision): signed links that were already emailed or copied
-- remain valid until their original expiry (up to 1 year after upload). They
-- can only be invalidated by moving/renaming the underlying files in storage
-- (and updating attachment_url accordingly); this migration does not do that.

UPDATE public.leave_requests
SET attachment_url = regexp_replace(
  attachment_url,
  '^https?://[^/]+/storage/v1/object/sign/leave-attachments/([^?#]+)([?#].*)?$',
  '\1'
)
WHERE attachment_url ~ '^https?://[^/]+/storage/v1/object/sign/leave-attachments/[^?#%]+([?#].*)?$';

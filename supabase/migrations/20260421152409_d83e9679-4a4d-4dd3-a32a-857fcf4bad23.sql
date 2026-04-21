ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS it_emails text;
ALTER TABLE public.portal_contacts ADD COLUMN IF NOT EXISTS email text;
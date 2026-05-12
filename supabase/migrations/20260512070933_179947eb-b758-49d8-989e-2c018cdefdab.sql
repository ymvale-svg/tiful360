-- Create public bucket for company logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Company logos are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

-- Authenticated users with admin/payroll/finance/it_manager/super_admin can upload/update/delete
CREATE POLICY "Authorized users can upload company logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos' AND (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'it_manager'::app_role) OR
    public.has_role(auth.uid(), 'payroll'::app_role) OR
    public.has_role(auth.uid(), 'finance'::app_role)
  )
);

CREATE POLICY "Authorized users can update company logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos' AND (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'it_manager'::app_role) OR
    public.has_role(auth.uid(), 'payroll'::app_role) OR
    public.has_role(auth.uid(), 'finance'::app_role)
  )
);

CREATE POLICY "Authorized users can delete company logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos' AND (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'it_manager'::app_role) OR
    public.has_role(auth.uid(), 'payroll'::app_role) OR
    public.has_role(auth.uid(), 'finance'::app_role)
  )
);

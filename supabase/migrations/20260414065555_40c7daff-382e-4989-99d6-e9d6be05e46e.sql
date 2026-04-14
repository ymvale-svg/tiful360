
-- Portal quick links managed by admins
CREATE TABLE public.portal_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.portal_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view company portal links" ON public.portal_links
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())));

CREATE POLICY "Admins manage company portal links" ON public.portal_links
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))));

-- Portal contacts managed by admins
CREATE TABLE public.portal_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL,
  department text NOT NULL,
  phone text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.portal_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view company portal contacts" ON public.portal_contacts
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())));

CREATE POLICY "Admins manage company portal contacts" ON public.portal_contacts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid()))));

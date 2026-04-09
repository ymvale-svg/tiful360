
-- Companies table
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- user_company_access table
CREATE TABLE IF NOT EXISTS public.user_company_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'employee',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id)
);
ALTER TABLE public.user_company_access ENABLE ROW LEVEL SECURITY;

-- Add company_id to all tables
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.asset_categories ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.category_fields ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.it_tickets ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.digital_access ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.user_company_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT company_id FROM public.user_company_access
  WHERE user_id = _user_id
$$;

-- Update has_role to also grant for super_admin
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND (role = _role OR role = 'super_admin')
  )
$$;

-- RLS: companies
CREATE POLICY "Super admins can manage companies"
  ON public.companies FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Users can view their companies"
  ON public.companies FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR id IN (SELECT public.user_company_ids(auth.uid())));

-- RLS: user_company_access
CREATE POLICY "Super admins manage all company access"
  ON public.user_company_access FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Users view own company access"
  ON public.user_company_access FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Company admins manage their company access"
  ON public.user_company_access FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_company_access uca
      WHERE uca.user_id = auth.uid()
        AND uca.company_id = user_company_access.company_id
        AND uca.role = 'admin'
    )
  );

-- Trigger
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

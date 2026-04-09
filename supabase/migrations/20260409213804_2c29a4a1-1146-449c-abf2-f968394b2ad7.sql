
-- ==========================================
-- תפעול 360 - Database Schema
-- ==========================================

-- Enum types
CREATE TYPE public.employee_status AS ENUM ('active', 'onboarding', 'leaving', 'inactive');
CREATE TYPE public.system_role AS ENUM ('admin', 'it', 'employee');
CREATE TYPE public.asset_status AS ENUM ('in_use', 'in_stock', 'in_repair', 'lost');
CREATE TYPE public.access_status AS ENUM ('active', 'suspended', 'blocked');
CREATE TYPE public.permission_level AS ENUM ('read', 'write', 'admin');
CREATE TYPE public.ticket_priority AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'done');
CREATE TYPE public.ticket_type AS ENUM ('offboarding', 'access', 'software', 'hardware');
CREATE TYPE public.alert_severity AS ENUM ('critical', 'warning', 'info');
CREATE TYPE public.field_type AS ENUM ('text', 'number', 'date', 'list');

-- ==========================================
-- 1. Profiles (linked to auth.users)
-- ==========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  system_role system_role NOT NULL DEFAULT 'employee',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 2. User Roles (separate table for RBAC)
-- ==========================================
CREATE TYPE public.app_role AS ENUM ('admin', 'it_manager', 'employee');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ==========================================
-- 3. Employees
-- ==========================================
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  id_number TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  department TEXT NOT NULL,
  direct_manager_id UUID REFERENCES public.employees(id),
  status employee_status NOT NULL DEFAULT 'active',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  phone TEXT,
  email TEXT,
  linked_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 4. Asset Categories
-- ==========================================
CREATE TABLE public.asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 5. Category Fields (dynamic fields per category)
-- ==========================================
CREATE TABLE public.category_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.asset_categories(id) ON DELETE CASCADE NOT NULL,
  field_name TEXT NOT NULL,
  field_type field_type NOT NULL DEFAULT 'text',
  is_required BOOLEAN NOT NULL DEFAULT false,
  field_options JSONB,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.category_fields ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 6. Assets
-- ==========================================
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code TEXT NOT NULL UNIQUE,
  category_id UUID REFERENCES public.asset_categories(id) NOT NULL,
  asset_name TEXT NOT NULL,
  serial_number TEXT,
  current_owner_id UUID REFERENCES public.employees(id),
  status asset_status NOT NULL DEFAULT 'in_stock',
  custom_fields JSONB DEFAULT '{}',
  expiry_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 7. Digital Access
-- ==========================================
CREATE TABLE public.digital_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  access_type TEXT NOT NULL,
  resource_path TEXT NOT NULL,
  permission_level permission_level NOT NULL DEFAULT 'read',
  status access_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.digital_access ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 8. IT Tickets
-- ==========================================
CREATE TABLE public.it_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  employee_id UUID REFERENCES public.employees(id) NOT NULL,
  ticket_type ticket_type NOT NULL,
  priority ticket_priority NOT NULL DEFAULT 'medium',
  status ticket_status NOT NULL DEFAULT 'open',
  assigned_to UUID REFERENCES auth.users(id),
  sla_deadline TIMESTAMPTZ,
  checklist JSONB DEFAULT '[]',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.it_tickets ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 9. Alerts
-- ==========================================
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  severity alert_severity NOT NULL DEFAULT 'info',
  target_date DATE,
  related_asset_id UUID REFERENCES public.assets(id),
  related_employee_id UUID REFERENCES public.employees(id),
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 10. Activity Log (immutable audit trail)
-- ==========================================
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id),
  action TEXT NOT NULL,
  details TEXT,
  entity_type TEXT,
  entity_id UUID,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 11. Announcements
-- ==========================================
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 12. Knowledge Base
-- ==========================================
CREATE TABLE public.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  category TEXT,
  file_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- Triggers: auto-update updated_at
-- ==========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_digital_access_updated_at BEFORE UPDATE ON public.digital_access FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_it_tickets_updated_at BEFORE UPDATE ON public.it_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_knowledge_base_updated_at BEFORE UPDATE ON public.knowledge_base FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- Trigger: auto-create profile on signup
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- RLS Policies
-- ==========================================

-- Profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System creates profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User Roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Employees
CREATE POLICY "Authenticated users can view employees" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage employees" ON public.employees FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update employees" ON public.employees FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete employees" ON public.employees FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Asset Categories
CREATE POLICY "Authenticated users can view categories" ON public.asset_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage categories" ON public.asset_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Category Fields
CREATE POLICY "Authenticated users can view fields" ON public.category_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage fields" ON public.category_fields FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Assets
CREATE POLICY "Authenticated users can view assets" ON public.assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage assets" ON public.assets FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update assets" ON public.assets FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete assets" ON public.assets FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Digital Access
CREATE POLICY "Authenticated users can view digital access" ON public.digital_access FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and IT can manage digital access" ON public.digital_access FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'it_manager'));

-- IT Tickets
CREATE POLICY "Authenticated users can view tickets" ON public.it_tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and IT can manage tickets" ON public.it_tickets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'it_manager'));
CREATE POLICY "Authenticated users can create tickets" ON public.it_tickets FOR INSERT TO authenticated WITH CHECK (true);

-- Alerts
CREATE POLICY "Authenticated users can view alerts" ON public.alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage alerts" ON public.alerts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Activity Log (read-only for everyone, system inserts)
CREATE POLICY "Authenticated users can view activity log" ON public.activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert activity log" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (true);

-- Announcements
CREATE POLICY "Everyone can view announcements" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage announcements" ON public.announcements FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Knowledge Base
CREATE POLICY "Everyone can view knowledge base" ON public.knowledge_base FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage knowledge base" ON public.knowledge_base FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==========================================
-- Indexes
-- ==========================================
CREATE INDEX idx_employees_status ON public.employees(status);
CREATE INDEX idx_employees_department ON public.employees(department);
CREATE INDEX idx_employees_linked_user ON public.employees(linked_user_id);
CREATE INDEX idx_assets_category ON public.assets(category_id);
CREATE INDEX idx_assets_owner ON public.assets(current_owner_id);
CREATE INDEX idx_assets_status ON public.assets(status);
CREATE INDEX idx_digital_access_employee ON public.digital_access(employee_id);
CREATE INDEX idx_it_tickets_status ON public.it_tickets(status);
CREATE INDEX idx_it_tickets_employee ON public.it_tickets(employee_id);
CREATE INDEX idx_alerts_severity ON public.alerts(severity);
CREATE INDEX idx_alerts_resolved ON public.alerts(is_resolved);
CREATE INDEX idx_activity_log_employee ON public.activity_log(employee_id);
CREATE INDEX idx_activity_log_created ON public.activity_log(created_at);

-- Minimal stand-in for the parts of the Supabase schema these tests touch. Not a migration.
DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE;
CREATE SCHEMA public; CREATE SCHEMA auth;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.app_role AS ENUM ('super_admin','admin','it_manager','operations','hr','payroll','finance','legal','employee','direct_manager','secretariat','ceo');
CREATE TYPE public.asset_status AS ENUM ('in_use','in_stock','in_repair','lost','inactive');
CREATE TYPE public.employee_status AS ENUM ('active','onboarding','leaving','inactive');
CREATE TYPE public.ticket_type AS ENUM ('offboarding','access','software','hardware','onboarding');
CREATE TYPE public.ticket_status AS ENUM ('open','in_progress','done');
CREATE TYPE public.ticket_priority AS ENUM ('critical','high','medium','low');

CREATE TABLE public.companies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.profiles (user_id uuid PRIMARY KEY, display_name text);
CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
CREATE TABLE public.user_company_access (user_id uuid, company_id uuid);
CREATE FUNCTION public.has_role(_u uuid, _r public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_u AND role=_r) $$;
CREATE FUNCTION public.is_super_admin(_u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.has_role(_u,'super_admin') $$;
CREATE FUNCTION public.is_operations(_u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.has_role(_u,'operations') $$;
CREATE FUNCTION public.is_hr(_u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.has_role(_u,'hr') $$;
CREATE FUNCTION public.user_company_ids(_u uuid) RETURNS SETOF uuid LANGUAGE sql STABLE AS $$ SELECT company_id FROM public.user_company_access WHERE user_id=_u $$;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.employees (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid REFERENCES public.companies(id), full_name text, role text, department text, email text, start_date date, status public.employee_status DEFAULT 'active', linked_user_id uuid, updated_at timestamptz DEFAULT now());
CREATE TABLE public.asset_categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, category_name text, prefix text, protocol_type text, onboarding_form_group text, sort_order int DEFAULT 0);
CREATE TABLE public.asset_groups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid, name text);
CREATE TABLE public.assets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, category_id uuid, group_id uuid, asset_name text, asset_code text, current_owner_id uuid, status public.asset_status NOT NULL DEFAULT 'in_stock');
CREATE TABLE public.activity_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid, company_id uuid, action text, details text, entity_type text, entity_id uuid, performed_by uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.it_tickets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, employee_id uuid, ticket_code text, title text, description text, subject_category text, ticket_type public.ticket_type, priority public.ticket_priority DEFAULT 'medium', status public.ticket_status DEFAULT 'open', assigned_to uuid, resolved_at timestamptz, resolved_by uuid, sla_deadline timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.permission_audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(), actor_user_id uuid, target_user_id uuid, target_employee_id uuid, company_id uuid, action text NOT NULL, details text, before_value jsonb, after_value jsonb);

CREATE TABLE public.onboarding_processes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE, employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE, status text NOT NULL DEFAULT 'draft', created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, pdf_url text, it_ticket_id uuid);
CREATE TABLE public.onboarding_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), process_id uuid NOT NULL REFERENCES public.onboarding_processes(id) ON DELETE CASCADE, item_type text NOT NULL DEFAULT 'asset', title text NOT NULL, owner_role text NOT NULL DEFAULT 'it_manager', catalog_ref_id uuid, selected_group_id uuid, fulfillment_type text, asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL, status text NOT NULL DEFAULT 'pending', notes text, completed_by uuid, completed_at timestamptz, assigned_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.it_tickets ADD COLUMN checklist jsonb;
ALTER TABLE public.employees ADD COLUMN employee_code text;
CREATE FUNCTION public.my_access_blocked() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
ALTER TABLE public.employees ADD COLUMN end_date date;

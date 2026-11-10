-- Vehicles and leasing: from "the role gets a tier-2 car" to quotes compared and a car ordered.
--
-- suppliers           Leasing companies (and later other suppliers), with the address quotes are
--                     requested from.
-- vehicle_tiers       Tiers of company cars (monthly cap, allowed models), and which roles get
--                     which tier (vehicle_tier_roles).
-- vehicle_requests    A car for an employee, usually from an onboarding item: tier, preferences,
--                     the quote request that was sent, the chosen quote, ordered and delivered.
-- vehicle_quotes      One quote per supplier, typed in or extracted from its PDF.
--
-- Fleet staff (admins, operations, finance) manage all of it; HR reads it. company_id of tier
-- roles and quotes is taken from their parent by trigger.

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  kind text NOT NULL DEFAULT 'leasing' CHECK (kind IN ('leasing', 'equipment', 'software', 'other')),
  contact_name text,
  email text CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_company_name_key UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS public.vehicle_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  level integer NOT NULL DEFAULT 1,
  -- Monthly lease cap in shekels; NULL = no cap.
  monthly_cap numeric(10, 2) CHECK (monthly_cap IS NULL OR monthly_cap >= 0),
  -- Models allowed in the tier, free text (one per line).
  allowed_models text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_tiers_company_name_key UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS public.vehicle_tier_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id uuid NOT NULL REFERENCES public.vehicle_tiers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  -- employees.role (and optionally employees.department) that are entitled to the tier.
  role_name text NOT NULL CHECK (length(btrim(role_name)) BETWEEN 1 AND 120),
  department text
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_tier_roles_unique
  ON public.vehicle_tier_roles (company_id, role_name, COALESCE(department, ''));

CREATE TABLE IF NOT EXISTS public.vehicle_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  onboarding_item_id uuid REFERENCES public.onboarding_items(id) ON DELETE SET NULL,
  tier_id uuid REFERENCES public.vehicle_tiers(id) ON DELETE SET NULL,
  -- {"fuel": "היברידי", "gearbox": "אוטומט", "models": ["…"], "notes": "…"}
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  desired_date date,
  period_months integer NOT NULL DEFAULT 36 CHECK (period_months BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'quotes_requested', 'chosen', 'ordered', 'delivered', 'cancelled')),
  quote_subject text,
  quote_body text,
  requested_supplier_ids uuid[] NOT NULL DEFAULT '{}',
  quotes_requested_at timestamptz,
  chosen_quote_id uuid,
  ordered_at timestamptz,
  delivered_at timestamptz,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vehicle_requests_employee_idx ON public.vehicle_requests(employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_requests_one_per_item
  ON public.vehicle_requests(onboarding_item_id) WHERE onboarding_item_id IS NOT NULL AND status <> 'cancelled';

CREATE TABLE IF NOT EXISTS public.vehicle_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.vehicle_requests(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  model text,
  monthly_price numeric(10, 2) CHECK (monthly_price IS NULL OR monthly_price >= 0),
  km_per_year integer CHECK (km_per_year IS NULL OR km_per_year >= 0),
  period_months integer CHECK (period_months IS NULL OR period_months BETWEEN 1 AND 120),
  delivery_date date,
  includes text,
  notes text,
  -- The quote file in asset-documents (<company_id>/vehicle-quotes/<request_id>/…).
  file_path text,
  -- What the AI read from the file, kept as it came back.
  extracted jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vehicle_quotes_request_idx ON public.vehicle_quotes(request_id);

ALTER TABLE public.vehicle_requests
  ADD CONSTRAINT vehicle_requests_chosen_quote_fkey FOREIGN KEY (chosen_quote_id)
  REFERENCES public.vehicle_quotes(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vehicle_set_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'vehicle_tier_roles' THEN
    SELECT company_id INTO NEW.company_id FROM public.vehicle_tiers WHERE id = NEW.tier_id;
  ELSE
    SELECT company_id INTO NEW.company_id FROM public.vehicle_requests WHERE id = NEW.request_id;
    -- A quote's supplier must be one of the same company.
    IF NEW.supplier_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.suppliers WHERE id = NEW.supplier_id AND company_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION 'supplier belongs to another company';
    END IF;
  END IF;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'parent row not found';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER vehicle_tier_roles_set_company BEFORE INSERT OR UPDATE ON public.vehicle_tier_roles
FOR EACH ROW EXECUTE FUNCTION public.vehicle_set_company();
CREATE TRIGGER vehicle_quotes_set_company BEFORE INSERT OR UPDATE ON public.vehicle_quotes
FOR EACH ROW EXECUTE FUNCTION public.vehicle_set_company();

-- The employee, the onboarding item and the tier of a request must be the request's company.
-- Definer rights: it only validates, and must see rows the caller's RLS may hide.
CREATE OR REPLACE FUNCTION public.vehicle_request_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = NEW.employee_id AND company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'employee belongs to another company';
  END IF;
  IF NEW.tier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vehicle_tiers WHERE id = NEW.tier_id AND company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'tier belongs to another company';
  END IF;
  IF NEW.onboarding_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.onboarding_items i JOIN public.onboarding_processes p ON p.id = i.process_id
    WHERE i.id = NEW.onboarding_item_id AND p.employee_id = NEW.employee_id AND p.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'onboarding item belongs to another employee';
  END IF;
  IF NEW.chosen_quote_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vehicle_quotes WHERE id = NEW.chosen_quote_id AND request_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'chosen quote belongs to another request';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.created_by_name := COALESCE((SELECT display_name FROM public.profiles WHERE user_id = auth.uid()), 'משתמש מזוהה');
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_by_name := OLD.created_by_name;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER vehicle_requests_check BEFORE INSERT OR UPDATE ON public.vehicle_requests
FOR EACH ROW EXECUTE FUNCTION public.vehicle_request_check();
CREATE TRIGGER vehicle_requests_updated_at BEFORE UPDATE ON public.vehicle_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fleet_can_view(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(auth.uid())
    OR ((public.has_role(auth.uid(), 'admin'::app_role) OR public.is_operations(auth.uid())
         OR public.has_role(auth.uid(), 'finance'::app_role) OR public.has_role(auth.uid(), 'hr'::app_role))
        AND _company_id IN (SELECT public.user_company_ids(auth.uid())));
$$;

CREATE OR REPLACE FUNCTION public.fleet_can_manage(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(auth.uid())
    OR ((public.has_role(auth.uid(), 'admin'::app_role) OR public.is_operations(auth.uid())
         OR public.has_role(auth.uid(), 'finance'::app_role))
        AND _company_id IN (SELECT public.user_company_ids(auth.uid())));
$$;

DO $$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['suppliers', 'vehicle_tiers', 'vehicle_tier_roles', 'vehicle_requests', 'vehicle_quotes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', _t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', _t);
    EXECUTE format('CREATE POLICY "Fleet staff view" ON public.%I FOR SELECT TO authenticated USING (public.fleet_can_view(company_id))', _t);
    EXECUTE format('CREATE POLICY "Fleet staff manage" ON public.%I FOR ALL TO authenticated USING (public.fleet_can_manage(company_id)) WITH CHECK (public.fleet_can_manage(company_id))', _t);
  END LOOP;
END $$;

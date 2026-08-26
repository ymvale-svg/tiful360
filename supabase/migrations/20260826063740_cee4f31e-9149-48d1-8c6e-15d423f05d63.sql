CREATE TABLE public.employee_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  license_plate text NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_vehicles_employee ON public.employee_vehicles(employee_id);
CREATE INDEX idx_employee_vehicles_company ON public.employee_vehicles(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_vehicles TO authenticated;
GRANT ALL ON public.employee_vehicles TO service_role;
ALTER TABLE public.employee_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vehicle managers can view employee vehicles"
ON public.employee_vehicles FOR SELECT TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'operations')
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'payroll')
  )
);

CREATE POLICY "Employees can view their own vehicles"
ON public.employee_vehicles FOR SELECT TO authenticated
USING (public.is_my_employee_record(employee_id, auth.uid()));

CREATE POLICY "Vehicle managers can insert employee vehicles"
ON public.employee_vehicles FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'operations')
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'payroll')
  )
);

CREATE POLICY "Vehicle managers can update employee vehicles"
ON public.employee_vehicles FOR UPDATE TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'operations')
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'payroll')
  )
);

CREATE POLICY "Vehicle managers can delete employee vehicles"
ON public.employee_vehicles FOR DELETE TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'operations')
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'payroll')
  )
);

CREATE TRIGGER update_employee_vehicles_updated_at
BEFORE UPDATE ON public.employee_vehicles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.vehicle_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_vehicle_id uuid REFERENCES public.employee_vehicles(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.assets(id) ON DELETE CASCADE,
  provider text NOT NULL,
  start_date date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_subscriptions_one_vehicle CHECK (
    (employee_vehicle_id IS NOT NULL AND asset_id IS NULL)
    OR (employee_vehicle_id IS NULL AND asset_id IS NOT NULL)
  ),
  CONSTRAINT vehicle_subscriptions_status_check CHECK (status IN ('active','suspended','cancelled'))
);

CREATE INDEX idx_vehicle_subscriptions_company ON public.vehicle_subscriptions(company_id);
CREATE INDEX idx_vehicle_subscriptions_emp_vehicle ON public.vehicle_subscriptions(employee_vehicle_id);
CREATE INDEX idx_vehicle_subscriptions_asset ON public.vehicle_subscriptions(asset_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_subscriptions TO authenticated;
GRANT ALL ON public.vehicle_subscriptions TO service_role;
ALTER TABLE public.vehicle_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vehicle managers can view subscriptions"
ON public.vehicle_subscriptions FOR SELECT TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'operations')
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'payroll')
  )
);

CREATE POLICY "Employees can view their own subscriptions"
ON public.vehicle_subscriptions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employee_vehicles ev
    WHERE ev.id = vehicle_subscriptions.employee_vehicle_id
      AND public.is_my_employee_record(ev.employee_id, auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.assets a
    WHERE a.id = vehicle_subscriptions.asset_id
      AND a.current_owner_id IS NOT NULL
      AND public.is_my_employee_record(a.current_owner_id, auth.uid())
  )
);

CREATE POLICY "Vehicle managers can insert subscriptions"
ON public.vehicle_subscriptions FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'operations')
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'payroll')
  )
);

CREATE POLICY "Vehicle managers can update subscriptions"
ON public.vehicle_subscriptions FOR UPDATE TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'operations')
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'payroll')
  )
);

CREATE POLICY "Vehicle managers can delete subscriptions"
ON public.vehicle_subscriptions FOR DELETE TO authenticated
USING (
  company_id IN (SELECT public.user_company_ids(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'operations')
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'payroll')
  )
);

CREATE TRIGGER update_vehicle_subscriptions_updated_at
BEFORE UPDATE ON public.vehicle_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
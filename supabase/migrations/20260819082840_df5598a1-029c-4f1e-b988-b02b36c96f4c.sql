DROP POLICY IF EXISTS "Employees update own pending handover forms" ON public.asset_handover_forms;
CREATE POLICY "Employees update own pending handover forms"
ON public.asset_handover_forms
FOR UPDATE
USING (
  status = 'pending' AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = asset_handover_forms.employee_id AND e.linked_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = asset_handover_forms.employee_id AND e.linked_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Employees update own pending offboarding forms" ON public.offboarding_forms;
CREATE POLICY "Employees update own pending offboarding forms"
ON public.offboarding_forms
FOR UPDATE
USING (
  status = 'pending' AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = offboarding_forms.employee_id AND e.linked_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = offboarding_forms.employee_id AND e.linked_user_id = auth.uid()
  )
);
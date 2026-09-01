DROP POLICY IF EXISTS "Staff insert company handover forms" ON public.asset_handover_forms;
CREATE POLICY "Staff insert company handover forms"
ON public.asset_handover_forms FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
);

DROP POLICY IF EXISTS "Staff update company handover forms" ON public.asset_handover_forms;
CREATE POLICY "Staff update company handover forms"
ON public.asset_handover_forms FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it_manager'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR (company_id IN (SELECT user_company_ids(auth.uid()))))
);
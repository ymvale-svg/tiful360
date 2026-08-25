
DROP POLICY IF EXISTS "Staff view company handover forms" ON public.asset_handover_forms;
CREATE POLICY "Staff view company handover forms"
ON public.asset_handover_forms FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    (has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'it_manager'::app_role)
     OR is_operations(auth.uid())
     OR has_role(auth.uid(), 'finance'::app_role)
     OR is_legal(auth.uid()))
    AND company_id IN (SELECT user_company_ids(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Staff view company signed documents" ON public.signed_documents;
CREATE POLICY "Staff view company signed documents"
ON public.signed_documents FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    (has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'it_manager'::app_role)
     OR is_operations(auth.uid())
     OR has_role(auth.uid(), 'finance'::app_role)
     OR is_legal(auth.uid()))
    AND company_id IN (SELECT user_company_ids(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Staff view company activity log" ON public.activity_log;
CREATE POLICY "Staff view company activity log"
ON public.activity_log FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    (has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'it_manager'::app_role)
     OR is_operations(auth.uid())
     OR has_role(auth.uid(), 'finance'::app_role)
     OR is_legal(auth.uid()))
    AND company_id IN (SELECT user_company_ids(auth.uid()))
  )
);

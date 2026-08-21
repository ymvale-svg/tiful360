DROP POLICY IF EXISTS "Authenticated read protocols" ON public.document_protocols;
CREATE POLICY "Admins and operations read protocols"
ON public.document_protocols
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    (has_role(auth.uid(), 'admin'::app_role) OR is_operations(auth.uid()))
    AND (company_id IS NULL OR company_id IN (SELECT user_company_ids(auth.uid())))
  )
);
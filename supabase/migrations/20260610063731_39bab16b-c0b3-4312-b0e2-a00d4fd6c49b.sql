DROP POLICY IF EXISTS "Authenticated can subscribe to own company punches" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to own company punches"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_company_access uca
    WHERE uca.user_id = auth.uid()
      AND COALESCE(extension, '') IN (
        'live_locations_' || uca.company_id::text,
        'attendance-flow-' || uca.company_id::text
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.linked_user_id = auth.uid()
      AND COALESCE(extension, '') = 'my_punches_' || e.id::text
  )
  OR public.is_super_admin(auth.uid())
);

-- Fix permissive INSERT policies
DROP POLICY "Authenticated users can create tickets" ON public.it_tickets;
DROP POLICY "System can insert activity log" ON public.activity_log;

-- IT tickets: only authenticated users linked to an employee, or admins/IT
CREATE POLICY "Authenticated users can create tickets" ON public.it_tickets
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'it_manager')
  OR EXISTS (SELECT 1 FROM public.employees WHERE linked_user_id = auth.uid())
);

-- Activity log: only admins and IT can insert
CREATE POLICY "Admins and IT can insert activity log" ON public.activity_log
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'it_manager')
);

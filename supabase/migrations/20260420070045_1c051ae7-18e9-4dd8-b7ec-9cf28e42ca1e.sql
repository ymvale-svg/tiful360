
CREATE OR REPLACE FUNCTION public.is_my_employee_record(_employee_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = _employee_id AND linked_user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_direct_manager_of(_employee_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees emp
    JOIN public.employees mgr ON mgr.id = emp.direct_manager_id
    WHERE emp.id = _employee_id AND mgr.linked_user_id = _user_id
  )
$$;

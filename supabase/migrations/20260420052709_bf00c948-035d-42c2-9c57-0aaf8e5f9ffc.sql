UPDATE public.employees
SET employee_code = 'EMP-' || employee_code
WHERE employee_code NOT LIKE 'EMP-%';
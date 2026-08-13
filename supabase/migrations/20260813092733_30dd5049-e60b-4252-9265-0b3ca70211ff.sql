create or replace function public.claim_employee_for_current_user()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_emp record;
begin
  if v_uid is null then
    return false;
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null then
    return false;
  end if;

  select id, linked_user_id into v_emp
  from public.employees
  where lower(email) = lower(v_email)
    and status = 'active'
  limit 1;

  if v_emp.id is null then
    return false;
  end if;

  if v_emp.linked_user_id is null then
    update public.employees set linked_user_id = v_uid where id = v_emp.id;
    return true;
  end if;

  return v_emp.linked_user_id = v_uid;
end;
$$;

grant execute on function public.claim_employee_for_current_user() to authenticated;
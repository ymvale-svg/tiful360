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
  v_linked_id uuid;
begin
  if v_uid is null then
    return false;
  end if;

  -- Already linked to an active employee card: authorized regardless of the
  -- email used for this sign-in (work email vs personal Google account).
  select id into v_linked_id
  from public.employees
  where linked_user_id = v_uid
    and status = 'active'
  limit 1;
  if v_linked_id is not null then
    return true;
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
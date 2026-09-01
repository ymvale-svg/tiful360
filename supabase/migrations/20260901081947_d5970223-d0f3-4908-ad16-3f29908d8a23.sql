create or replace function public.add_own_remote_punch(
  _direction text,
  _signature text default null,
  _note text default null,
  _geo jsonb default null,
  _user_agent text default null
)
returns public.attendance_punches
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_emp record;
  v_row public.attendance_punches;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if _direction not in ('in','out') then
    raise exception 'כיוון לא תקין';
  end if;

  select id, company_id, employee_code, can_remote_punch
    into v_emp
  from public.employees
  where linked_user_id = v_uid and status = 'active'
  limit 1;

  if v_emp.id is null then
    raise exception 'לא נמצא כרטיס עובד פעיל' using errcode = '42501';
  end if;

  if not coalesce(v_emp.can_remote_punch, false) then
    raise exception 'אין הרשאה להחתמת נוכחות מרחוק' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.attendance_punches
    where employee_id = v_emp.id
      and direction = _direction
      and abs(extract(epoch from (punch_at - v_now))) < 300
  ) then
    raise exception 'קיימת כבר החתמה בשעה זו';
  end if;

  insert into public.attendance_punches (
    company_id, employee_id, employee_code_raw, punch_at, direction, source, status, raw_payload
  ) values (
    v_emp.company_id,
    v_emp.id,
    coalesce(v_emp.employee_code, ''),
    v_now,
    _direction,
    'portal_remote',
    'pending',
    jsonb_build_object(
      'signature_data_url', _signature,
      'note', _note,
      'geo', _geo,
      'user_agent', _user_agent
    )
  )
  returning * into v_row;

  return v_row;
end;
$function$;

revoke all on function public.add_own_remote_punch(text, text, text, jsonb, text) from public, anon;
grant execute on function public.add_own_remote_punch(text, text, text, jsonb, text) to authenticated;
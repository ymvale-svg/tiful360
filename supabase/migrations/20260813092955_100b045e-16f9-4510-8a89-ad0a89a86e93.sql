create or replace function public.add_own_punch(_punch_at timestamptz, _direction text)
returns public.attendance_punches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_emp record;
  v_row public.attendance_punches;
  v_punch_date date;
  v_today date;
  v_month_edits integer;
begin
  if v_uid is null then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if _direction not in ('in','out') then raise exception 'כיוון לא תקין'; end if;

  select id, company_id, employee_code from public.employees
    into v_emp
    where linked_user_id = v_uid and status = 'active'
    limit 1;
  if v_emp.id is null then
    raise exception 'לא נמצא כרטיס עובד פעיל' using errcode = '42501';
  end if;

  v_punch_date := (_punch_at at time zone 'Asia/Jerusalem')::date;
  v_today := (now() at time zone 'Asia/Jerusalem')::date;

  if v_punch_date > v_today then
    raise exception 'לא ניתן להוסיף החתמה לתאריך עתידי';
  end if;

  if v_today > v_punch_date + 1 then
    if date_trunc('month', v_punch_date) <> date_trunc('month', v_today) then
      raise exception 'לא ניתן להוסיף החתמה מחודש קודם';
    end if;

    select count(*) into v_month_edits
    from public.attendance_punches
    where employee_id = v_emp.id
      and edited_by = v_uid
      and edited_at >= date_trunc('month', (now() at time zone 'Asia/Jerusalem'))::timestamptz;

    if v_month_edits >= 3 then
      raise exception 'ניצלת 3 תיקוני נוכחות עצמיים החודש. פנה למנהל';
    end if;
  end if;

  if exists (
    select 1 from public.attendance_punches
    where employee_id = v_emp.id
      and (punch_at at time zone 'Asia/Jerusalem')::date = v_punch_date
      and direction = _direction
      and abs(extract(epoch from (punch_at - _punch_at))) < 300
  ) then
    raise exception 'קיימת כבר החתמה בשעה זו';
  end if;

  insert into public.attendance_punches (
    company_id, employee_id, employee_code_raw, punch_at, direction,
    source, status, edited_at, edited_by, raw_payload
  ) values (
    v_emp.company_id, v_emp.id, coalesce(v_emp.employee_code, ''), _punch_at, _direction,
    'manual_self', 'approved', now(), v_uid,
    jsonb_build_object('manual_add', jsonb_build_object('added_at', now(), 'added_by', v_uid, 'added_by_role', 'employee_self'))
  )
  returning * into v_row;

  if v_row.id is null then
    raise exception 'קיימת כבר החתמה סמוכה לשעה זו';
  end if;

  return v_row;
end;
$$;

grant execute on function public.add_own_punch(timestamptz, text) to authenticated;
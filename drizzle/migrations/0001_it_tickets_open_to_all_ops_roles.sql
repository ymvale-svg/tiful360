-- Helper: true when the user holds ANY operations-side (non-employee) role
create or replace function public.is_ops_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role <> 'employee'::app_role
  )
$$;

revoke execute on function public.is_ops_staff(uuid) from anon;
grant execute on function public.is_ops_staff(uuid) to authenticated;

-- Widen staff access on it_tickets to all ops-side roles
drop policy if exists "Staff view company tickets" on public.it_tickets;
drop policy if exists "Staff manage company tickets" on public.it_tickets;

create policy "Staff view company tickets"
on public.it_tickets
for select
to authenticated
using (
  is_super_admin(auth.uid())
  or (is_ops_staff(auth.uid()) and company_id in (select user_company_ids(auth.uid())))
);

create policy "Staff manage company tickets"
on public.it_tickets
for all
to authenticated
using (
  is_ops_staff(auth.uid())
  and (is_super_admin(auth.uid()) or company_id in (select user_company_ids(auth.uid())))
);

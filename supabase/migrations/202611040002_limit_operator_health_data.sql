-- Limit operators to support tickets and enforce completion of mandatory password changes.
create or replace function public.password_change_completed(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select not must_change from public.profiles where id = _user_id), false)
$$;

revoke all on function public.password_change_completed(uuid) from public, anon;
grant execute on function public.password_change_completed(uuid) to authenticated, service_role;

drop policy if exists records_read on public.app_records;
create policy records_read
on public.app_records
for select
to authenticated
using (
  public.password_change_completed(auth.uid())
  and (
    owner_id = auth.uid()
    or public.has_role(auth.uid(), 'mestre')
    or (public.has_role(auth.uid(), 'operador') and kind = 'tickets')
    or kind = 'config'
  )
);

drop policy if exists records_insert on public.app_records;
create policy records_insert
on public.app_records
for insert
to authenticated
with check (
  public.password_change_completed(auth.uid())
  and (public.has_role(auth.uid(), 'mestre') or (owner_id = auth.uid() and kind <> 'config'))
);

drop policy if exists records_update on public.app_records;
create policy records_update
on public.app_records
for update
to authenticated
using (
  public.password_change_completed(auth.uid())
  and (
    public.has_role(auth.uid(), 'mestre')
    or (owner_id = auth.uid() and kind <> 'config')
    or (kind = 'tickets' and public.has_role(auth.uid(), 'operador'))
  )
)
with check (
  public.password_change_completed(auth.uid())
  and (
    public.has_role(auth.uid(), 'mestre')
    or (owner_id = auth.uid() and kind <> 'config')
    or (kind = 'tickets' and public.has_role(auth.uid(), 'operador'))
  )
);

drop policy if exists records_delete on public.app_records;
create policy records_delete
on public.app_records
for delete
to authenticated
using (
  public.password_change_completed(auth.uid())
  and (public.has_role(auth.uid(), 'mestre') or (owner_id = auth.uid() and kind <> 'config'))
);

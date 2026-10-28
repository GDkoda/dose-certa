-- Server-side idempotency for scheduled medication reminders.
-- Keep delivery metadata free of medication names or other health details.
create table if not exists public.push_deliveries (
  delivery_key text primary key,
  device_token text not null references public.push_devices(token) on delete cascade,
  dose_id text not null,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists push_deliveries_attempted_at_idx
  on public.push_deliveries (attempted_at);
create index if not exists push_deliveries_dose_id_idx
  on public.push_deliveries (dose_id);

alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;
grant all on public.push_deliveries to service_role;

create or replace function public.claim_push_delivery(p_dose text, p_key text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer := 0;
begin
  insert into public.push_deliveries (delivery_key, dose_id, device_token, attempted_at, sent_at)
  values (p_key, p_dose, p_token, now(), null)
  on conflict (delivery_key) do update
    set attempted_at = now()
    where public.push_deliveries.sent_at is null
      and public.push_deliveries.attempted_at < now() - interval '2 minutes';
  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

revoke all on function public.claim_push_delivery(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_push_delivery(text, text, text) to service_role;

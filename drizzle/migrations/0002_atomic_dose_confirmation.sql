create or replace function public.confirm_doses_and_deduct_stock(p_owner uuid, p_dose_ids text[], p_taken_at timestamptz default now())
returns table(dose_id text) language plpgsql security definer set search_path = '' as $$
declare
  dose_row record; medication_payload jsonb; medication_id text;
  stock_value numeric; quantity_value numeric; stock_text text; quantity_text text;
begin
  if p_owner is null or coalesce(array_length(p_dose_ids, 1), 0) = 0 then return; end if;
  for dose_row in
    select records.id, records.payload from public.app_records as records
    where records.owner_id = p_owner and records.kind = 'doses' and records.id = any(p_dose_ids)
    order by records.id for update
  loop
    if coalesce(dose_row.payload ->> 'status', '') <> 'pendente' then continue; end if;
    update public.app_records
       set payload = jsonb_set(jsonb_set(dose_row.payload, '{status}', '"tomado"'::jsonb, true),
         '{takenAt}', to_jsonb(coalesce(p_taken_at, now())::text), true)
     where id = dose_row.id and owner_id = p_owner and kind = 'doses' and payload ->> 'status' = 'pendente';
    if not found then continue; end if;
    medication_id := dose_row.payload ->> 'medId';
    if medication_id is not null and medication_id <> '' then
      select records.payload into medication_payload from public.app_records as records
       where records.id = medication_id and records.owner_id = p_owner and records.kind = 'meds' for update;
      if found then
        stock_text := medication_payload ->> 'stock';
        quantity_text := medication_payload ->> 'quantityPerDose';
        if stock_text ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then
          stock_value := stock_text::numeric;
          if quantity_text ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' and quantity_text::numeric > 0 then
            quantity_value := quantity_text::numeric;
          else quantity_value := 1; end if;
          update public.app_records
             set payload = jsonb_set(payload, '{stock}', to_jsonb(greatest(0, stock_value - quantity_value)), true)
           where id = medication_id and owner_id = p_owner and kind = 'meds';
        end if;
      end if;
    end if;
    dose_id := dose_row.id;
    return next;
  end loop;
end;
$$;
revoke all on function public.confirm_doses_and_deduct_stock(uuid, text[], timestamptz) from public, anon, authenticated;
grant execute on function public.confirm_doses_and_deduct_stock(uuid, text[], timestamptz) to service_role;
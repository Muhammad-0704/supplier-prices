-- Утренняя сводка в Telegram считает склад по закупочным ценам: серверу (service role) тоже можно
-- получить себестоимость строк расходных. Остальным, кроме руководителя столовых, по-прежнему пусто.

create or replace function public.canteen_cost_lines(p_from timestamptz, p_to timestamptz, p_canteen uuid default null)
returns table (
  shipment_id bigint, canteen_id uuid, onec_doc_ref uuid, doc_number text, doc_date timestamptz,
  item_id uuid, item_name text, item_unit text, qty numeric, price numeric, amount numeric,
  cost numeric, cost_date timestamptz, set_price numeric, set_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select s.id, cc.canteen_id, s.onec_doc_ref, s.doc_number, s.doc_date,
         s.item_id, s.item_name, s.item_unit, s.qty, s.price, s.amount,
         c.price, c.doc_date, ps.price, ps.set_at
  from public.shipments s
  join public.canteen_customers cc on cc.customer_id = s.customer_id
  left join public.items i on i.id = s.item_id
  left join lateral (
    select pu.price, pu.doc_date from public.purchases pu
    where pu.item_id = any(array(select i2.id from public.items i2 where coalesce(i2.merged_into, i2.id) = coalesce(i.merged_into, i.id)))
      and public.is_supplier_receipt(pu.operation) and pu.doc_date <= s.doc_date
    order by pu.doc_date desc, pu.id desc limit 1
  ) c on true
  left join lateral (
    select p.price, p.set_at from public.price_settings p
    where p.item_id = s.item_id and (s.price_type_ref is null or p.price_type_ref is null or p.price_type_ref = s.price_type_ref)
      and p.set_at <= s.doc_date
    order by p.set_at desc, p.id desc limit 1
  ) ps on true
  where (public.is_canteen_manager() or auth.role() = 'service_role')
    and s.doc_date >= p_from and s.doc_date < p_to
    and (p_canteen is null or cc.canteen_id = p_canteen)
  order by s.doc_date, s.id;
$$;
grant execute on function public.canteen_cost_lines(timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.canteen_cost_summary(timestamptz, timestamptz) to service_role;

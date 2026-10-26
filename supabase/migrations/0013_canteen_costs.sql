-- «Столовые», аналитика: установка цен склада из 1С, вид цены в расходных,
-- себестоимость строк расходных по последней закупке и контроль наценки. Видит только руководитель столовых.

-- Вид цены расходной накладной (в 1С склада их три): сравниваем с установленной ценой того же вида
alter table public.shipments add column if not exists price_type_ref uuid;

-- Строки документов «Установка цен номенклатуры»
create table public.price_settings (
  id              bigint generated always as identity primary key,
  onec_doc_ref    uuid not null,
  line_no         int  not null,
  set_at          timestamptz not null,
  item_id         uuid not null references public.items(id) on delete cascade,
  price_type_ref  uuid,
  price           numeric(14,2) not null,
  old_price       numeric(14,2),
  created_at      timestamptz not null default now(),
  unique (onec_doc_ref, line_no)
);
create index price_settings_item_idx on public.price_settings(item_id, price_type_ref, set_at desc);

alter table public.price_settings enable row level security;
create policy "managers read price settings" on public.price_settings for select to authenticated
  using (public.is_manager() or public.is_canteen_manager());

-- Быстрый поиск последней закупки товара на дату
create index if not exists purchases_item_date_idx on public.purchases(item_id, doc_date desc);
create index if not exists items_group_idx on public.items((coalesce(merged_into, id)));

/**
 * Строки расходных на точки за период с себестоимостью:
 *   cost      — последняя закупочная цена товара (поступление от поставщика) на дату отгрузки, склеенные карточки вместе;
 *   set_price — последняя установленная цена того же вида на дату отгрузки.
 * Пусто для всех, кроме руководителя столовых: закупочные цены админам точек не видны.
 */
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
  where public.is_canteen_manager()
    and s.doc_date >= p_from and s.doc_date < p_to
    and (p_canteen is null or cc.canteen_id = p_canteen)
  order by s.doc_date, s.id;
$$;

revoke execute on function public.canteen_cost_lines(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.canteen_cost_lines(timestamptz, timestamptz, uuid) to authenticated;

-- Итоги по точкам и дням (по Москве) для экрана руководителя: по расходным, по закупочным
create or replace function public.canteen_cost_summary(p_from timestamptz, p_to timestamptz)
returns table (canteen_id uuid, day date, amount numeric, cost_amount numeric, costed_amount numeric, lines int, lines_no_cost int)
language sql stable security definer set search_path = public as $$
  select l.canteen_id, (l.doc_date at time zone 'Europe/Moscow')::date,
         round(sum(l.amount), 2),
         round(sum(l.cost * l.qty) filter (where l.cost is not null), 2),
         round(sum(l.amount) filter (where l.cost is not null), 2),
         count(*)::int,
         (count(*) filter (where l.cost is null))::int
  from public.canteen_cost_lines(p_from, p_to) l
  group by 1, 2;
$$;
revoke execute on function public.canteen_cost_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.canteen_cost_summary(timestamptz, timestamptz) to authenticated;

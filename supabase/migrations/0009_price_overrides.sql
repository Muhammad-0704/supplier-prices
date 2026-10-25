-- Ручные отметки цен: «цена устарела» или «новая цена со слов поставщика».
-- Действуют, пока от этого поставщика не придёт накладная новее отметки.
create table public.price_overrides (
  item_id      uuid not null references public.items(id) on delete cascade,
  supplier_id  uuid not null references public.suppliers(id) on delete cascade,
  kind         text not null check (kind in ('price','stale')),
  price        numeric(14,2) check (price > 0),
  note         text,
  set_by       uuid references auth.users(id) on delete set null default auth.uid(),
  set_by_name  text,                                 -- имя для подписи «отметил Иван» (профили коллег сотруднику не видны)
  set_at       timestamptz not null default now(),
  primary key (item_id, supplier_id),
  constraint price_overrides_price check (kind = 'stale' or price is not null)
);
alter table public.price_overrides enable row level security;
-- Отмечать может любой участник команды: сотрудники чаще всего и созваниваются с поставщиками
create policy "members read overrides"   on public.price_overrides for select to authenticated using (public.is_member());
create policy "members insert overrides" on public.price_overrides for insert to authenticated with check (public.is_member() and set_by = auth.uid());
create policy "members update overrides" on public.price_overrides for update to authenticated using (public.is_member()) with check (public.is_member() and set_by = auth.uid());
create policy "members delete overrides" on public.price_overrides for delete to authenticated using (public.is_member());
alter publication supabase_realtime add table public.price_overrides;

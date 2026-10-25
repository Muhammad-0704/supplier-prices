-- Помощник заказа: пересчёт склада с телефона и отметки «заказано» / «отложить».
-- Остатки из 1С не используются: решение строится по ритму закупок и фактическому пересчёту.

create table public.stock_counts (
  id          bigint generated always as identity primary key,
  item_id     uuid not null references public.items(id) on delete cascade,
  qty         numeric(14,3) not null check (qty >= 0),
  counted_at  timestamptz not null default now(),
  counted_by  uuid references auth.users(id) on delete set null default auth.uid()
);
create index stock_counts_item_idx on public.stock_counts(item_id, counted_at desc);

create table public.reorder_marks (
  item_id    uuid primary key references public.items(id) on delete cascade,
  status     text not null check (status in ('ordered','snoozed')),
  until      timestamptz,
  marked_by  uuid references auth.users(id) on delete set null default auth.uid(),
  marked_at  timestamptz not null default now()
);

alter table public.stock_counts  enable row level security;
alter table public.reorder_marks enable row level security;

-- Пересчитывать склад и отмечать заказы может любой участник команды
create policy "members read counts"  on public.stock_counts for select to authenticated using (public.is_member());
create policy "members add counts"   on public.stock_counts for insert to authenticated with check (public.is_member() and counted_by = auth.uid());
create policy "members read marks"   on public.reorder_marks for select to authenticated using (public.is_member());
create policy "members write marks"  on public.reorder_marks for all to authenticated using (public.is_member()) with check (public.is_member());

alter publication supabase_realtime add table public.stock_counts;
alter publication supabase_realtime add table public.reorder_marks;

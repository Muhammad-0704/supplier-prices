-- Поставщики, которые не участвуют в заявке (их закупки не учитываются в ритме, их цены — в выборе «где дешевле»).
-- Меняет руководитель в «Настройках» → «Заявка».
create table public.supplier_flags (
  supplier_id      uuid primary key references public.suppliers(id) on delete cascade,
  skip_request     boolean not null default false,
  note             text,
  updated_by       uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at       timestamptz not null default now()
);
alter table public.supplier_flags enable row level security;
create policy "members read supplier flags"  on public.supplier_flags for select to authenticated using (public.is_member());
create policy "manager writes supplier flags" on public.supplier_flags for all to authenticated using (public.is_manager()) with check (public.is_manager());

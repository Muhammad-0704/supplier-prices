-- Режим «ТВ» для офиса: вход по ссылке-ключу, без обычного логина.
-- Публичный роут /tv/[token] читает данные через service_role (как /o/[token] для поставщиков),
-- поэтому отдельных anon-политик на canteens/shipments/daily_reports/iiko_revenue не нужно.

create table public.tv_links (
  id             uuid primary key default gen_random_uuid(),
  token          text not null unique,
  name           text not null default 'ТВ',
  active         boolean not null default true,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  last_opened_at timestamptz,
  open_count     integer not null default 0
);

alter table public.tv_links enable row level security;

create policy "canteen manager manages tv links" on public.tv_links
  for all using (public.is_canteen_manager()) with check (public.is_canteen_manager());

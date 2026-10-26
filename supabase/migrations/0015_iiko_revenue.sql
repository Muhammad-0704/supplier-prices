-- iiko: выручка точек по дням с их серверов iiko (iikoServer API, OLAP-отчёт по продажам).
-- Логин и пароль — в переменных Vercel (IIKO_LOGIN, IIKO_PASSWORD), здесь только адреса серверов.

create table public.iiko_servers (
  canteen_id  uuid primary key references public.canteens(id) on delete cascade,
  host        text not null,            -- kafe-levyi-bereg.iiko.it
  login       text,                     -- если на этом сервере логин отличается от IIKO_LOGIN
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Выручка за день по точке: наличные, безнал (карты и прочие безналичные оплаты), чеки
create table public.iiko_revenue (
  canteen_id  uuid not null references public.canteens(id) on delete cascade,
  day         date not null,
  cash        numeric(14,2) not null default 0,
  card        numeric(14,2) not null default 0,
  total       numeric(14,2) not null default 0,
  checks      int not null default 0,
  by_pay_type jsonb not null default '{}'::jsonb,   -- {"Наличные": 12000, "Банковские карты": 30500, ...}
  synced_at   timestamptz not null default now(),
  primary key (canteen_id, day)
);

alter table public.iiko_servers enable row level security;
alter table public.iiko_revenue enable row level security;
create policy "canteen manager reads iiko servers" on public.iiko_servers for select to authenticated using (public.is_canteen_manager());
create policy "manager edits iiko servers" on public.iiko_servers for all to authenticated using (public.is_canteen_manager()) with check (public.is_canteen_manager());
create policy "see own iiko revenue" on public.iiko_revenue for select to authenticated using (public.can_see_canteen(canteen_id));

insert into public.iiko_servers (canteen_id, host)
select c.id, v.host from public.canteens c
join (values
  ('Кронштадтский', 'kafe-na-kronshtadtskom-bulvare.iiko.it'),
  ('Петрашка',      'kafe-na-petrozavodskoi.iiko.it'),
  ('Левый Берег',   'kafe-levyi-bereg.iiko.it'),
  ('Домодедово',    'kafe-fudsiti-domodedovo.iiko.it')
) as v(name, host) on v.name = c.name
on conflict (canteen_id) do nothing;

-- Платформа «База»: один аккаунт на человека, права по каждому сервису отдельно,
-- и сервис «Столовые» (точки, расходные накладные склада на точки, ежедневные отчёты).

-- ---------- Права по сервисам ----------
-- profiles.role — доступ к прайс-доске: manager | staff | null (нет доступа)
-- profiles.canteen_role — доступ к «Столовым»: manager (все точки) | admin (свои точки) | null
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles alter column role drop not null;
alter table public.profiles add constraint profiles_role_check check (role is null or role in ('manager','staff'));
alter table public.profiles add column if not exists canteen_role text check (canteen_role in ('manager','admin'));
update public.profiles set canteen_role = 'manager' where role = 'manager' and canteen_role is null;

-- Участник прайс-доски — только тот, у кого есть роль в ней (админ точки цены склада не видит)
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role is not null);
$$;

create or replace function public.is_canteen_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and canteen_role = 'manager');
$$;

-- ---------- Точки ----------
create table public.canteens (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort        int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Покупатель в 1С склада (Контрагент) → точка. Сопоставляется один раз, руководитель может поправить.
create table public.canteen_customers (
  customer_id  uuid primary key references public.suppliers(id) on delete cascade,
  canteen_id   uuid not null references public.canteens(id) on delete cascade
);
create index canteen_customers_canteen_idx on public.canteen_customers(canteen_id);

-- Какие точки видит админ (один админ может отвечать за несколько: Гастромания + Донер Дубровка)
create table public.canteen_admins (
  user_id     uuid not null references auth.users(id) on delete cascade,
  canteen_id  uuid not null references public.canteens(id) on delete cascade,
  primary key (user_id, canteen_id)
);

create or replace function public.can_see_canteen(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_canteen_manager()
      or exists (select 1 from public.canteen_admins a join public.profiles p on p.id = a.user_id
                 where a.user_id = auth.uid() and a.canteen_id = c and p.canteen_role is not null);
$$;

create or replace function public.can_see_customer(cust uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_canteen_manager()
      or exists (select 1 from public.canteen_customers cc
                 join public.canteen_admins a on a.canteen_id = cc.canteen_id
                 join public.profiles p on p.id = a.user_id
                 where cc.customer_id = cust and a.user_id = auth.uid() and p.canteen_role is not null);
$$;

-- ---------- Расходные накладные склада ----------
-- Все покупатели: привязка к точке может появиться позже, строки уже будут на месте.
-- Название и единица товара хранятся в строке: админ точки не читает справочник склада.
create table public.shipments (
  id            bigint generated always as identity primary key,
  onec_doc_ref  uuid not null,
  line_no       int  not null,
  doc_number    text,
  doc_date      timestamptz not null,
  customer_id   uuid not null references public.suppliers(id) on delete cascade,
  item_id       uuid references public.items(id) on delete set null,
  item_name     text not null,
  item_unit     text not null default 'шт',
  item_category text not null default 'Без группы',
  qty           numeric(14,3) not null default 0,
  price         numeric(14,2) not null default 0,
  amount        numeric(14,2) not null default 0,
  operation     text,
  created_at    timestamptz not null default now(),
  unique (onec_doc_ref, line_no)
);
create index shipments_customer_date_idx on public.shipments(customer_id, doc_date desc);
create index shipments_date_idx on public.shipments(doc_date desc);

-- Состояние синхронизации расходных: «по данным 1С на такое-то время»
create table public.sync_state (
  key         text primary key,
  at          timestamptz not null default now(),
  ok          boolean not null default true,
  message     text
);

-- ---------- Ежедневный отчёт точки ----------
create table public.daily_reports (
  id           bigint generated always as identity primary key,
  canteen_id   uuid not null references public.canteens(id) on delete cascade,
  report_date  date not null,
  cash         numeric(14,2) not null default 0 check (cash >= 0),
  card         numeric(14,2) not null default 0 check (card >= 0),
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (canteen_id, report_date)
);
create index daily_reports_date_idx on public.daily_reports(report_date desc);

-- Админ точки сдаёт и правит отчёт за сегодня и вчера (по Москве); руководитель — за любой день
create or replace function public.can_edit_report(c uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_canteen_manager()
      or (public.can_see_canteen(c) and d between (now() at time zone 'Europe/Moscow')::date - 1 and (now() at time zone 'Europe/Moscow')::date);
$$;

-- ---------- Права (RLS) ----------
alter table public.canteens          enable row level security;
alter table public.canteen_customers enable row level security;
alter table public.canteen_admins    enable row level security;
alter table public.shipments         enable row level security;
alter table public.sync_state        enable row level security;
alter table public.daily_reports     enable row level security;

create policy "see own canteens"       on public.canteens for select to authenticated using (public.can_see_canteen(id));
create policy "manager writes canteens" on public.canteens for all to authenticated using (public.is_canteen_manager()) with check (public.is_canteen_manager());

create policy "see own customer links"  on public.canteen_customers for select to authenticated using (public.can_see_canteen(canteen_id));
create policy "manager links customers" on public.canteen_customers for all to authenticated using (public.is_canteen_manager()) with check (public.is_canteen_manager());

create policy "see own admin rows"      on public.canteen_admins for select to authenticated using (user_id = auth.uid() or public.is_canteen_manager());
create policy "manager assigns admins"  on public.canteen_admins for all to authenticated using (public.is_canteen_manager()) with check (public.is_canteen_manager());

create policy "see own shipments"       on public.shipments for select to authenticated using (public.can_see_customer(customer_id));

create policy "canteen users read sync" on public.sync_state for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and (canteen_role is not null or role is not null)));

create policy "see own reports"   on public.daily_reports for select to authenticated using (public.can_see_canteen(canteen_id));
create policy "submit reports"    on public.daily_reports for insert to authenticated
  with check (public.can_edit_report(canteen_id, report_date) and created_by = auth.uid() and updated_by = auth.uid());
create policy "fix reports"       on public.daily_reports for update to authenticated
  using (public.can_edit_report(canteen_id, report_date))
  with check (public.can_edit_report(canteen_id, report_date) and updated_by = auth.uid());
create policy "manager deletes reports" on public.daily_reports for delete to authenticated using (public.is_canteen_manager());

-- Руководитель столовых видит контрагентов, чтобы привязать покупателей к точкам
create policy "canteen manager reads suppliers" on public.suppliers for select to authenticated using (public.is_canteen_manager());
-- и профили людей, чтобы раздавать доступы
create policy "canteen manager reads profiles" on public.profiles for select to authenticated using (public.is_canteen_manager());

revoke execute on function public.is_canteen_manager() from public, anon;
revoke execute on function public.can_see_canteen(uuid) from public, anon;
revoke execute on function public.can_see_customer(uuid) from public, anon;
revoke execute on function public.can_edit_report(uuid, date) from public, anon;
grant execute on function public.is_canteen_manager() to authenticated;
grant execute on function public.can_see_canteen(uuid) to authenticated;
grant execute on function public.can_see_customer(uuid) to authenticated;
grant execute on function public.can_edit_report(uuid, date) to authenticated;

-- ---------- Точки и покупатели 1С ----------
insert into public.canteens (name, sort) values
  ('Гастромания', 1), ('Донер Дубровка', 2), ('Кронштадтский', 3),
  ('Левый Берег', 4), ('Домодедово', 5), ('Петрашка', 6)
on conflict (name) do nothing;

-- Покупатели в 1С названы так же, как точки (сверено по справочнику контрагентов)
insert into public.canteen_customers (customer_id, canteen_id)
select s.id, c.id from public.suppliers s join public.canteens c on lower(trim(s.name)) = lower(c.name)
on conflict (customer_id) do nothing;

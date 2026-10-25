-- Прайс-доска: схема базы. Выполните целиком в Supabase → SQL Editor (или `supabase db push`).

create extension if not exists pgcrypto;

-- ---------- Справочники из 1С ----------
create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  onec_ref    uuid unique,                 -- Ref_Key контрагента в 1С
  name        text not null,
  inn         text,
  updated_at  timestamptz not null default now()
);

create table public.items (
  id           uuid primary key default gen_random_uuid(),
  onec_ref     uuid unique,                -- Ref_Key номенклатуры в 1С
  name         text not null,
  unit         text not null default 'шт',
  category     text not null default 'Без группы',
  -- «Склейка» дублей: если в 1С одна позиция заведена дважды, укажите здесь основную карточку
  merged_into  uuid references public.items(id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint items_not_self_merged check (merged_into is null or merged_into <> id)
);
create index items_merged_into_idx on public.items(merged_into);

-- ---------- Закупки: строки приходных накладных ----------
create table public.purchases (
  id            bigint generated always as identity primary key,
  onec_doc_ref  uuid not null,             -- Ref_Key приходной накладной
  line_no       int  not null,             -- LineNumber строки табличной части
  doc_number    text,
  doc_date      timestamptz not null,
  supplier_id   uuid not null references public.suppliers(id) on delete cascade,
  item_id       uuid not null references public.items(id) on delete cascade,
  price         numeric(14,2) not null check (price >= 0),
  qty           numeric(14,3) not null default 0,
  created_at    timestamptz not null default now(),
  unique (onec_doc_ref, line_no)
);
create index purchases_item_supplier_date_idx on public.purchases(item_id, supplier_id, doc_date desc);
create index purchases_date_idx on public.purchases(doc_date desc);

-- ---------- Пользователи и роли ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'staff' check (role in ('manager','staff')),
  created_at  timestamptz not null default now()
);

-- Профиль создаёт только руководитель (страница «Команда»): самостоятельная регистрация в Supabase не даёт доступа к ценам.

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'manager');
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

-- ---------- Настройки доски ----------
-- Скрытые товары: общая настройка команды, меняет руководитель
create table public.item_flags (
  item_id     uuid primary key references public.items(id) on delete cascade,
  hidden      boolean not null default false,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- Избранное: у каждого своё
create table public.user_favorites (
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_id     uuid not null references public.items(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Журнал синхронизаций с 1С
create table public.sync_runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running','ok','error')),
  trigger      text not null default 'manual',     -- manual | cron
  message      text,
  docs         int not null default 0,
  lines        int not null default 0
);

-- ---------- Представления для доски ----------
-- Последняя и предыдущая цена по каждой паре «товар × поставщик» (с учётом склеенных карточек)
create or replace view public.offer_prices with (security_invoker = true) as
with p as (
  select coalesce(i.merged_into, i.id) as item_id,
         pu.supplier_id, pu.price, pu.doc_date,
         row_number() over (partition by coalesce(i.merged_into, i.id), pu.supplier_id
                            order by pu.doc_date desc, pu.id desc) as rn
  from public.purchases pu
  join public.items i on i.id = pu.item_id
)
select item_id, supplier_id,
       max(price)    filter (where rn = 1) as last_price,
       max(price)    filter (where rn = 2) as prev_price,
       max(doc_date) filter (where rn = 1) as last_date
from p
where rn <= 2
group by item_id, supplier_id;

-- Средний расход в месяц за последние 90 дней (для расчёта переплаты)
create or replace view public.item_usage with (security_invoker = true) as
select coalesce(i.merged_into, i.id) as item_id,
       round(sum(pu.qty) / 3.0, 3) as monthly_qty
from public.purchases pu
join public.items i on i.id = pu.item_id
where pu.doc_date >= now() - interval '90 days'
group by 1;

-- ---------- Права (RLS) ----------
alter table public.suppliers      enable row level security;
alter table public.items          enable row level security;
alter table public.purchases      enable row level security;
alter table public.profiles       enable row level security;
alter table public.item_flags     enable row level security;
alter table public.user_favorites enable row level security;
alter table public.sync_runs      enable row level security;

-- Читать цены и справочники могут все участники команды. Пишет в них только синхронизация (service role).
create policy "members read suppliers" on public.suppliers for select to authenticated using (public.is_member());
create policy "members read items"     on public.items     for select to authenticated using (public.is_member());
create policy "members read purchases" on public.purchases for select to authenticated using (public.is_member());
create policy "members read sync"      on public.sync_runs for select to authenticated using (public.is_member());
create policy "manager merges items"   on public.items     for update to authenticated using (public.is_manager()) with check (public.is_manager());

-- Профили: каждый видит себя, руководитель видит и меняет всех
create policy "read own or manager"  on public.profiles for select to authenticated using (id = auth.uid() or public.is_manager());
create policy "manager updates"      on public.profiles for update to authenticated using (public.is_manager()) with check (public.is_manager());

-- Скрытые товары: видят все, меняет руководитель
create policy "members read flags"   on public.item_flags for select to authenticated using (public.is_member());
create policy "manager writes flags" on public.item_flags for all    to authenticated using (public.is_manager()) with check (public.is_manager());

-- Избранное: только своё
create policy "own favorites" on public.user_favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());

-- ---------- Живые обновления ----------
alter publication supabase_realtime add table public.purchases;
alter publication supabase_realtime add table public.sync_runs;

-- ---------- Функции прав не вызываются анонимно ----------
revoke execute on function public.is_manager() from public, anon;
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.is_member() to authenticated;

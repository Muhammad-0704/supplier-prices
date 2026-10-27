-- iiko: продажи подробно — по часам, блюдам, кассирам; удаления и возвраты.
-- demo = true — тестовые данные для показа; первая настоящая загрузка из iiko удаляет их по этой точке сама.

alter table public.iiko_revenue add column if not exists demo boolean not null default false;

-- Час дня: выручка и чеки (час закрытия чека, по Москве)
create table if not exists public.iiko_hours (
  canteen_id uuid not null references public.canteens(id) on delete cascade,
  day        date not null,
  hour       smallint not null check (hour between 0 and 23),
  revenue    numeric(14,2) not null default 0,
  checks     int not null default 0,
  demo       boolean not null default false,
  primary key (canteen_id, day, hour)
);

-- Блюдо за день: количество, выручка со скидкой, сумма скидки
create table if not exists public.iiko_dishes (
  canteen_id uuid not null references public.canteens(id) on delete cascade,
  day        date not null,
  dish       text not null,
  category   text not null default '',
  qty        numeric(14,3) not null default 0,
  revenue    numeric(14,2) not null default 0,
  discount   numeric(14,2) not null default 0,
  demo       boolean not null default false,
  primary key (canteen_id, day, dish)
);

-- Кассир за день: выручка, чеки, скидки
create table if not exists public.iiko_staff (
  canteen_id uuid not null references public.canteens(id) on delete cascade,
  day        date not null,
  cashier    text not null,
  revenue    numeric(14,2) not null default 0,
  checks     int not null default 0,
  discount   numeric(14,2) not null default 0,
  demo       boolean not null default false,
  primary key (canteen_id, day, cashier)
);

-- Удаления позиций из заказа и возвраты: кто, что, на сколько
create table if not exists public.iiko_voids (
  id         bigserial primary key,
  canteen_id uuid not null references public.canteens(id) on delete cascade,
  day        date not null,
  kind       text not null check (kind in ('deleted', 'return')),
  cashier    text not null default '',
  dish       text not null default '',
  qty        numeric(14,3) not null default 0,
  amount     numeric(14,2) not null default 0,
  writeoff   boolean,               -- удалено со списанием продуктов / без
  demo       boolean not null default false
);
create index if not exists iiko_voids_canteen_day on public.iiko_voids (canteen_id, day);

alter table public.iiko_hours  enable row level security;
alter table public.iiko_dishes enable row level security;
alter table public.iiko_staff  enable row level security;
alter table public.iiko_voids  enable row level security;

-- Часы и блюда видит и админ своей точки; кассиров, удаления и возвраты — только руководитель
create policy "see own iiko hours"  on public.iiko_hours  for select to authenticated using (public.can_see_canteen(canteen_id));
create policy "see own iiko dishes" on public.iiko_dishes for select to authenticated using (public.can_see_canteen(canteen_id));
create policy "manager sees iiko staff" on public.iiko_staff for select to authenticated using (public.is_canteen_manager());
create policy "manager sees iiko voids" on public.iiko_voids for select to authenticated using (public.is_canteen_manager());

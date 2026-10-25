-- Предложения цен от поставщиков по персональным ссылкам.
-- Поставщик не входит в систему: его страница работает через сервер с проверкой токена ссылки.
-- Поэтому для анонимов доступа к этим таблицам нет вовсе; читают участники команды, меняет руководитель.

create table public.offer_links (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique,                 -- случайная строка в ссылке /o/<token>
  supplier_id     uuid references public.suppliers(id) on delete set null,  -- поставщик из 1С, если выбран
  company_name    text not null,                        -- как фирма называется на странице и в предложениях
  scope           text not null check (scope in ('supplier_items', 'categories', 'items')),
  categories      text[] not null default '{}',         -- для scope = categories
  item_ids        uuid[] not null default '{}',         -- для scope = items
  active          boolean not null default true,
  expires_at      timestamptz,
  note            text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_opened_at  timestamptz,
  open_count      int not null default 0
);

create table public.offer_submissions (
  id            bigint generated always as identity primary key,
  link_id       uuid not null references public.offer_links(id) on delete cascade,
  contact       text,                                   -- имя или телефон того, кто заполнял (по желанию)
  comment       text,
  created_at    timestamptz not null default now()
);
create index offer_submissions_link_idx on public.offer_submissions(link_id, created_at desc);

create table public.offer_lines (
  id             bigint generated always as identity primary key,
  submission_id  bigint not null references public.offer_submissions(id) on delete cascade,
  link_id        uuid not null references public.offer_links(id) on delete cascade,
  item_id        uuid references public.items(id) on delete set null,  -- товар из нашего списка
  custom_name    text,                                  -- или свой товар поставщика
  unit           text,
  price          numeric(14,2) not null check (price > 0),
  min_qty        text,
  valid_until    date,
  comment        text,
  status         text not null default 'new' check (status in ('new', 'accepted', 'rejected')),
  reviewed_by    uuid references auth.users(id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint offer_lines_item_or_custom check (item_id is not null or coalesce(trim(custom_name), '') <> '')
);
create index offer_lines_item_idx on public.offer_lines(item_id, created_at desc);
create index offer_lines_status_idx on public.offer_lines(status, created_at desc);

-- Настройки приложения (чат Telegram для уведомлений и т.п.)
create table public.app_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

alter table public.offer_links       enable row level security;
alter table public.offer_submissions enable row level security;
alter table public.offer_lines       enable row level security;
alter table public.app_settings      enable row level security;

create policy "members read links"   on public.offer_links       for select to authenticated using (public.is_member());
create policy "manager writes links" on public.offer_links       for all    to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "members read subs"    on public.offer_submissions for select to authenticated using (public.is_member());
create policy "members read lines"   on public.offer_lines       for select to authenticated using (public.is_member());
create policy "manager reviews"      on public.offer_lines       for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "manager settings"     on public.app_settings      for all    to authenticated using (public.is_manager()) with check (public.is_manager());

-- Последнее предложение каждой фирмы по каждому товару (не отклонённое) — для доски
create or replace view public.latest_offers with (security_invoker = true) as
select distinct on (l.link_id, l.item_id)
       l.id, l.link_id, l.item_id, l.price, l.min_qty, l.valid_until, l.status, l.created_at,
       k.company_name, k.supplier_id
from public.offer_lines l
join public.offer_links k on k.id = l.link_id
where l.item_id is not null
  and l.status <> 'rejected'
  and (l.valid_until is null or l.valid_until >= current_date)
order by l.link_id, l.item_id, l.created_at desc;

alter publication supabase_realtime add table public.offer_lines;

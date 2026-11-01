-- ТВ: короткий вход по 6 цифрам вместо длинной ссылки.
-- Руководитель в «Доступах» получает код на 10 минут; на ТВ открывают /tv и вводят цифры — экран открывает /tv/<token>.
-- Код одноразовый. Попытки ввода пишутся в журнал: не больше 10 неудачных с одного адреса и 100 всего за 10 минут.

alter table public.tv_links
  add column if not exists pair_code    text,
  add column if not exists pair_expires timestamptz;

create unique index if not exists tv_links_pair_code on public.tv_links (pair_code) where pair_code is not null;

create table if not exists public.tv_pair_attempts (
  id  bigserial primary key,
  ip  text not null,
  ok  boolean not null default false,
  at  timestamptz not null default now()
);
create index if not exists tv_pair_attempts_at on public.tv_pair_attempts (at);

-- Журнал только для сервера (service_role): политик нет, обычным пользователям он не виден
alter table public.tv_pair_attempts enable row level security;

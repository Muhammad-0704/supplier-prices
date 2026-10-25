-- Фасовка товара для сравнения цен за кг / л / шт и загрузка прайсов поставщиков из файла.

-- Ручная поправка фасовки. Если строки нет, фасовка берётся из названия.
create table public.item_measures (
  item_id     uuid primary key references public.items(id) on delete cascade,
  base        text check (base in ('кг','л','шт')),
  per_unit    numeric(14,6) check (per_unit > 0),
  disabled    boolean not null default false,          -- «не сравнивать за кг»
  updated_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now(),
  constraint item_measures_value check (disabled or (base is not null and per_unit is not null))
);
alter table public.item_measures enable row level security;
create policy "members read measures"  on public.item_measures for select to authenticated using (public.is_member());
create policy "manager writes measures" on public.item_measures for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- Откуда пришло предложение: по ссылке поставщик заполнил сам или руководитель загрузил его прайс
alter table public.offer_submissions add column source text not null default 'link' check (source in ('link','file'));
alter table public.offer_submissions add column file_name text;

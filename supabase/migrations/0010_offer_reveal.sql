-- Что поставщик видит по своей ссылке.
alter table public.offer_links add column reveal text not null default 'verdict' check (reveal in ('price','verdict','none'));
comment on column public.offer_links.reveal is 'Что видит поставщик: price — нашу цену при заполнении; verdict — только «подходит / не подходит» после отправки; none — ничего';

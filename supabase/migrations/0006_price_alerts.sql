-- Журнал сигналов о ценах: что и когда отправлено в Telegram. Нужен и для еженедельной сводки,
-- и чтобы одна и та же строка накладной не дала сигнал дважды.
create table public.price_alerts (
  id              bigint generated always as identity primary key,
  kind            text not null check (kind in ('up', 'down', 'cheapest')),
  onec_doc_ref    uuid not null,
  line_no         int  not null,
  doc_number      text,
  doc_date        timestamptz not null,
  item_id         uuid not null references public.items(id) on delete cascade,
  supplier_id     uuid not null references public.suppliers(id) on delete cascade,
  price           numeric(14,2) not null,
  ref_price       numeric(14,2) not null,          -- с чем сравнивали
  ref_supplier_id uuid references public.suppliers(id) on delete set null,
  change          numeric(8,4) not null,           -- доля: 0.12 = +12%
  created_at      timestamptz not null default now(),
  unique (onec_doc_ref, line_no, kind)
);
create index price_alerts_created_idx on public.price_alerts(created_at desc);

alter table public.price_alerts enable row level security;
create policy "members read alerts" on public.price_alerts for select to authenticated using (public.is_member());

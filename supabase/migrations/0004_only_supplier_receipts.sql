-- В ценах участвуют только поступления от поставщиков. Возвраты от покупателей (клиенты вроде «Гастромании»)
-- и прочие виды операций приходной накладной в доску не попадают. Пустой вид операции (демо-режим) считается поступлением.

create or replace function public.is_supplier_receipt(op text) returns boolean
language sql immutable set search_path = '' as $$ select op is null or op = 'ПоступлениеОтПоставщика' $$;

create or replace view public.offer_prices with (security_invoker = true) as
with p as (
  select coalesce(i.merged_into, i.id) as item_id,
         pu.supplier_id, pu.price, pu.doc_date,
         row_number() over (partition by coalesce(i.merged_into, i.id), pu.supplier_id
                            order by pu.doc_date desc, pu.id desc) as rn
  from public.purchases pu
  join public.items i on i.id = pu.item_id
  where public.is_supplier_receipt(pu.operation)
)
select item_id, supplier_id,
       max(price)    filter (where rn = 1) as last_price,
       max(price)    filter (where rn = 2) as prev_price,
       max(doc_date) filter (where rn = 1) as last_date
from p
where rn <= 2
group by item_id, supplier_id;

create or replace view public.item_usage with (security_invoker = true) as
select coalesce(i.merged_into, i.id) as item_id,
       round(sum(pu.qty) / 3.0, 3) as monthly_qty
from public.purchases pu
join public.items i on i.id = pu.item_id
where pu.doc_date >= now() - interval '90 days'
  and public.is_supplier_receipt(pu.operation)
group by 1;

create or replace view public.supplier_usage with (security_invoker = true) as
select supplier_id,
       count(distinct onec_doc_ref) filter (where doc_date >= now() - interval '90 days') as docs_90d,
       count(distinct onec_doc_ref) as docs_total,
       max(doc_date) as last_date
from public.purchases
where public.is_supplier_receipt(operation)
group by supplier_id;

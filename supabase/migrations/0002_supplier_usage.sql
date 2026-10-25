-- Популярность поставщика: сколько накладных за последние 90 дней (для порядка колонок на доске)
create or replace view public.supplier_usage with (security_invoker = true) as
select supplier_id,
       count(distinct onec_doc_ref) filter (where doc_date >= now() - interval '90 days') as docs_90d,
       count(distinct onec_doc_ref) as docs_total,
       max(doc_date) as last_date
from public.purchases
group by supplier_id;

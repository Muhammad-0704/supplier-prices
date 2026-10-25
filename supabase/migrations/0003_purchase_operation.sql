-- Вид операции приходной накладной из 1С (поступление от поставщика, возврат от покупателя и т.д.)
alter table public.purchases add column if not exists operation text;

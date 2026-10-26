-- Ежедневный отчёт точки: сумма мяса за день по накладным мясного магазина (админ пишет сам, как в тетради).
-- Фудкост точки = (склад + мясо) ÷ выручка.
alter table public.daily_reports add column if not exists meat numeric(14,2) not null default 0 check (meat >= 0);

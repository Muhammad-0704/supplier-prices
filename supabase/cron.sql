-- Синхронизация с 1С каждые 10 минут через Supabase (бесплатный тариф Vercel запускает свои задания только раз в сутки).
-- 1. Database → Extensions: включите pg_cron и pg_net.
-- 2. Подставьте адрес сайта на Vercel и значение CRON_SECRET из переменных окружения, выполните в SQL Editor.

select cron.schedule(
  'sync-1c-every-10-min',
  '*/10 6-22 * * *',          -- с 6:00 до 22:59 по UTC (9:00–01:59 по Москве); поменяйте под свой график
  $$
  select net.http_get(
    url     := 'https://ВАШ-САЙТ.vercel.app/api/sync',
    headers := jsonb_build_object('Authorization', 'Bearer ВАШ_CRON_SECRET'),
    timeout_milliseconds := 55000
  );
  $$
);

-- Посмотреть задания:       select * from cron.job;
-- Остановить синхронизацию:  select cron.unschedule('sync-1c-every-10-min');

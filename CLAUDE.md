# CLAUDE.md — «База»: Прайс-доска и Центр Питания

Контекст проекта для Claude Code. Владелец и заказчик — Мухаммад (руководитель склада и сети столовых). Общение и интерфейс — на русском.

## Правила (от владельца, обязательные)

1. **Пароли и ключи не просить и не писать в чат, код, коммиты.** Владелец сам вводит их в Vercel → Environment Variables. В ответах — только имена переменных.
2. **Ничего не покупать и не удалять без явного подтверждения**: данные в базе, проекты, деплои, домены, точки, места в командах Vercel/Supabase.
3. Каждое изменение — отдельная ветка и PR в `main`. Вливает владелец. В описании PR первой строкой: «Только код, без SQL» или «Нужен SQL: …».
4. Схема базы меняется **только новой миграцией** `supabase/migrations/00NN_*.sql` (следующий номер — `0020`). Миграции владелец запускает сам в Supabase → SQL Editor; в PR/чате дать готовый SQL. Только добавлять: без `drop` колонок и таблиц. Данные (insert/update/delete) можно через SQL, удаление — после подтверждения.
5. Права режутся в базе (RLS), не в интерфейсе. Закупочные цены, кассиры, удаления — только руководителю.
6. Перед PR: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` — всё зелёное. Интерфейс проверять на десктопе, телефоне (≤640px) и в тёмной теме.
7. Тексты в интерфейсе — простыми словами для админов точек, без жаргона.

## Что это

Одна платформа склада: один вход (Supabase Auth), одна база, одна синхронизация с 1С. На главной `/` — плитки только тех сервисов, к которым у человека есть доступ (`SERVICES` в `src/lib/access.ts`); если сервис один — сразу в него.

| Сервис | Пути | Кто |
| --- | --- | --- |
| Прайс-доска | `/price`, `/order`, `/offers`, `/settings`, `/team`, `/o/<токен>` (поставщики без входа) | `profiles.role`: `manager` / `staff` |
| ТВ в офисе | `/tv` (вход по 6 цифрам), `/tv/<токен>` — без логина; ссылки и коды — «Доступы» | руководитель выдаёт |
| Центр Питания | `/canteens`, `/canteens/[id]`, `/canteens/[id]/sales`, `/canteens/access`, `/canteens/export`, `/canteens/markup` (скрыта из меню) | `profiles.canteen_role`: `manager` — все точки; `admin` — свои из `canteen_admins` |

Один хозяин у склада и точек, взаиморасчётов нет. Сайт должен открываться в России без VPN (свой домен через прокси — в планах, пути уже разделены).

**Центр Питания — тест ноябрь 2026 на двух точках:** Кронштадтский и Петрашка (= «Петрозаводская»). Остальные (Гастромания, Донер Дубровка, Левый Берег, Домодедово) скрыты `canteens.active = false`, данные и привязки целы. Админ Гастромании видит и Донер.

## Инфраструктура

| | |
| --- | --- |
| Сайт | https://pricedoska.vercel.app (`NEXT_PUBLIC_SITE_URL`) |
| GitHub | `Muhammad-0704/supplier-prices`, ветка `main` (репозиторий публичный — секретов в нём нет и быть не должно) |
| Vercel | team `team_aYGJw9qog4utdRlF0MncikfK`, project `prj_A80hqGLPy3S3fbU1lZpzNzmsNm0d`, регион `fra1`, Node 24, деплой из `main` автоматически |
| Supabase | project ref `vdiwcuenjcbasjbueinl` (Frankfurt), org `xvnpmdqwckuxjftewgsr`. Второй проект `vkhswlgrwxssvscatexm` — старый, не трогать |
| 1С | 1С:Фреш, УНФ склада, стандартный OData (`ONEC_ODATA_URL`), только чтение |
| iiko | iikoServer на каждой точке, `*.iiko.it` (таблица `iiko_servers`) |
| Telegram | бот сайта; чат руководителя — `app_settings.telegram_chat_id`, личные чаты админов — `app_settings` ключ `tg_chat:<user_id>` |

Был эпизод: Vercel поставил проект на паузу и отдавал 402 до оплаты. Если сайт «упал» — сначала смотреть статус проекта и биллинг Vercel.

## Команды

```bash
npm install
npm run dev          # нужен .env.local (шаблон .env.example); ONEC_MODE=mock — без 1С
npm test             # vitest
npm run lint
npm run typecheck
npm run build
```

Локальная проверка вёрстки без ключей: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run dev` и временная страница под публичным префиксом `/login-…` (middleware пускает `/login*` без входа), которая рендерит компоненты на фикстурах. Скриншоты — Playwright. Временную страницу удалить до коммита.

## Переменные окружения (значения только в Vercel)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`*, `NEXT_PUBLIC_SITE_URL`, `ONEC_MODE` (`odata`), `ONEC_ODATA_URL`, `ONEC_USER`*, `ONEC_PASSWORD`*, `SYNC_DAYS_BACK` (180), `NEXT_PUBLIC_RARE_DAYS` (30), `CRON_SECRET`*, `TELEGRAM_BOT_TOKEN`*, `IIKO_LOGIN`*, `IIKO_PASSWORD`* (* — Sensitive). **`IIKO_LOGIN`/`IIKO_PASSWORD` пока не заданы** — без них `runIikoSync` тихо возвращает `null`. После изменения переменных — Redeploy.

## Расписание

| Задача | Где | UTC | Что |
| --- | --- | --- | --- |
| `sync-1c-every-10-min` | Supabase pg_cron, job 2 | `*/10 5-21 * * *` | GET `/api/sync` с `Authorization: Bearer <CRON_SECRET>` |
| `order-digest-morning` | pg_cron, job 3 | `20 5 * * 1-6` | `/api/order-digest` |
| `/api/sync` | Vercel Cron | `0 5 * * *` | запасной запуск |
| `/api/weekly` | Vercel Cron | `0 6 * * 1` | недельная сводка прайс-доски |
| `/api/canteens/notify?kind=reminder` | Vercel Cron | `0 18 * * *` | 21:00 МСК: админам, кто не сдал отчёт |
| `/api/canteens/notify?kind=summary` | Vercel Cron | `30 5 * * *` | 8:30 МСК: руководителю сводка за вчера |

`CRON_SECRET` записан и в Vercel, и в командах `cron.job` — менять в обоих местах. Ответы pg_cron — `net._http_response`. Публичные пути без входа — массив `PUBLIC` в `src/middleware.ts`.

`/api/sync` (`src/app/api/sync/route.ts`) по цепочке: `runSync` (приходные → прайс-доска) → `runShipmentsSync` (расходные на точки) → `runPriceSettingsSync` (установки цен) → `runIikoSync` (не чаще раза в 30 минут, по кнопке «Обновить» — сразу). Защита от параллельного запуска — `sync_runs.status = 'running'` за 6 минут. Состояние — `sync_state` (ключи `shipments`, `price_settings`, `iiko`).

## Код

| Где | Что |
| --- | --- |
| `src/lib/access.ts` | `getAccess`, `requirePrice`, `requireCanteens`, `SERVICES` |
| `src/lib/onec/`, `src/lib/sync.ts`, `src/lib/shipments-sync.ts` | OData 1С: `Document_ПриходнаяНакладная`, `Document_РасходнаяНакладная` (+ табличная часть `_Запасы`), `Document_УстановкаЦенНоменклатуры` (поле вида цен `ВидЦен_Key`/`ВидЦены_Key`) |
| `src/lib/iiko/client.ts` | вход `/resto/api/auth?login=&pass=<sha1>`, `fetchSales` за **один** вход, `logout` в `finally` (каждый вход занимает лицензию) |
| `src/lib/iiko/olap.ts`, `details.ts` | OLAP `reportType=SALES`: поля выбираются из `/v2/reports/olap/columns` по списку кандидатов; срезы — выручка по дням и типам оплат, чеки, часы (`HourClose`), блюда, кассиры, удаления (`DeletedWithWriteoff`), возвраты (`Storned`). Нет поля — срез пропускается |
| `src/lib/iiko/sync.ts` | период: с последнего **не-demo** дня минус 2 (первый раз — с начала прошлого месяца); подробности за период перезаписываются; при первой настоящей загрузке точки её `demo`-строки удаляются |
| `src/lib/canteens.ts` | `summarize`, `mskDay`, `monthRange`, `reportMismatch`, `realCost` |
| `src/lib/canteens-view.ts` | `buildViews`/`totalView` — единые цифры для экрана, Excel, Telegram; `fcZone`, `FOODCOST_NORM = 0.4` |
| `src/lib/canteens-data.ts` | загрузчики; `pages()` — постранично по 1000 (лимит Supabase!) |
| `src/lib/iiko-insights.ts` | экран «Продажи»: `flow`, `byWeekday`, `byHour`, `menu`, `cashiers`, `voids` |
| `src/lib/canteens-notify.ts`, `telegram.ts` | тексты и отправка в Telegram |
| `src/components/canteens/` | `Overview`, `ReportForm`, `Sales`, `PointTabs`, `Foodcost`, `Charts`, `SyncNote` |
| `src/app/globals.css`, `tokens.css` | стили; цвета только через токены, тёмная тема `[data-theme="dark"]` |

## Данные

- Прайс-доска: `suppliers`, `items`, `purchases`, `offer_links/submissions/lines`, `price_alerts`, `reorder_marks`, `price_overrides`, `supplier_flags`, `item_flags`, `user_favorites`, `sync_runs`.
- Центр Питания: `canteens` (`active`, `sort`), `canteen_customers` (покупатель 1С → точка; имена покупателей в 1С = названия точек), `canteen_admins`, `shipments` (строки расходных), `price_settings`, `daily_reports` (`cash`, `card`, `meat`; `created_by is null` = тестовая строка), `iiko_servers`, `iiko_revenue`, `iiko_hours`, `iiko_dishes`, `iiko_staff`, `iiko_voids` (у iiko-таблиц `demo boolean`).
- Функции: `is_canteen_manager()`, `can_see_canteen(id)`, RPC `canteen_cost_summary(p_from, p_to)`, `canteen_cost_lines(p_from, p_to, p_canteen)` (только руководитель; `0016` разрешает service_role — применена ли, не подтверждено).
- RLS: `iiko_hours`/`iiko_dishes` — `can_see_canteen`; `iiko_staff`/`iiko_voids` — только `is_canteen_manager`.

## Бизнес-логика, которую легко сломать

- **Фудкост** = (склад + мясо) ÷ выручка **только за дни, где выручка известна** (иначе месяц закупок делится на один отчёт → 378%).
- Склад у **руководителя — по закупочным** (последняя закупка до даты отгрузки), у **админа — по ценам расходных** (закупочных он не видит). Наценки 10% в интерфейсе не показывать.
- Зоны: ≤35% хорошо, 35–40% норма, >40% дорого; шкала 0–60%, черта нормы 40%.
- Выручка: где есть iiko — из iiko; отчёт админа (нал/безнал) подсвечивается при расхождении >1% или >100 ₽. Мясо всегда из отчёта (админы пишут сумму с накладных).
- Админ сдаёт отчёт за сегодня или вчера; руководитель — за любой день.
- Проверка наценки (страница `markup`): допуск max(1 ₽; 0,5%) от «закупка × 1,1».
- Время — Москва (`mskDay`); крон — UTC.

## Состояние на 1 ноября 2026

- В `main` влиты PR до #10. **PR #9 открыт** (сообщения в Telegram о сбое/восстановлении загрузки 1С и iiko) — ждёт владельца.
- Применены миграции 0001–0017 (0016 — под вопросом).
- 1С синхронизируется нормально.
- iiko не подключён: владелец создаёт пользователя «База API» (только просмотр OLAP) с одинаковыми логином и паролем на серверах Кронштадтского и Петрашки; в iikoOffice Кронштадтского не пускает admin — ищется пароль. Активны в `iiko_servers` только эти две точки.
- В iiko-таблицах тестовый октябрь для двух точек (`demo = true`) — уйдёт сам при первой настоящей загрузке.
- В `daily_reports` у Кронштадтского есть пробный отчёт за 27.10 (нал 126 520, безнал 265 320, мясо 108 520) — скорее всего тест владельца; удалить только после его подтверждения.

## Следующие шаги

После подключения iiko: запустить синхронизацию, сверить выручку iiko с кассой за несколько дней.

Идеи, согласованные как направление (порядок — по пользе):
1. Режим «ТВ» для офиса: отдельная страница с крупными цифрами за сегодня по точкам, автообновление и смена экранов, вход по отдельной ссылке-ключу (отзывается в «Доступах»), без кассиров и меню.
2. Тревоги в Telegram с порогами: удаления без списания за смену, выручка ниже обычного для дня недели, падение среднего чека, расхождение отчёта с кассой, фудкост дня.
3. План выручки и целевой фудкост по точке.
4. Маржа блюд по техкартам iiko и ценам 1С («меню-инженерия»).
5. Прибыль точки (расходы: ФОТ, аренда и т. п.).
6. Прогноз «сколько готовить» и заявка на склад (смысл отложенного «Склада»).

Отложено владельцем: «Склад», Тандырная и Кондитерка, iiko для Гастромании и Донера, мясо из 1С (ждём выгрузку).

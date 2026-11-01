'use client';
import { useEffect, useState } from 'react';
import { dayTitle } from '@/lib/canteens';
import { FOODCOST_NORM, fcText, fcZone } from '@/lib/canteens-view';
import styles from './tv.module.css';

/** Та же шкала 0–60%, что и в остальном приложении (components.css .fc), для консистентности. */
const FC_SCALE = 0.6;

export interface TvHour { hour: number; revenue: number }
export interface TvDish { dish: string; qty: number; revenue: number }
export interface TvWeekday { label: string; revenue: number | null; checks: number | null }
export interface TvCashier { cashier: string; revenue: number; checks: number; voidRate: number | null }
export interface TvVoids { deletedCount: number; deletedAmount: number; returnsCount: number; returnsAmount: number }

export interface TvPoint {
  id: string; name: string;
  revenue: number; foodcost: number | null; buy: number; meat: number;
  cash: number; card: number; checks: number;
  reported: boolean;
  mismatch: number | null;
  hours: TvHour[];
  peakHour: TvHour | null;
  topDishes: TvDish[];
  month: { revenue: number; foodcost: number | null; buy: number; meat: number };
  weekdays: TvWeekday[];
  topCashiers: TvCashier[];
  voidsTotal: TvVoids;
}

const POLL_MS = 60_000;

const SCREENS = [
  { id: 'overview', label: 'Сводка' },
  { id: 'reports', label: 'Отчёты' },
  { id: 'sales', label: 'Продажи' },
  { id: 'hours', label: 'По часам' },
  { id: 'dishes', label: 'Блюда' },
  { id: 'month', label: 'Месяц' },
  { id: 'week', label: 'Дни недели' },
  { id: 'cashiers', label: 'Кассиры' },
  { id: 'voids', label: 'Удаления' },
] as const;
type ScreenId = (typeof SCREENS)[number]['id'];

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className={styles.clock}>{now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })}</span>;
}

/** Деньги для ТВ: до миллиона — полностью (46 120 ₽), дальше — 2,53 млн ₽ */
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
function money(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2).replace('.', ',')}\u00a0млн\u00a0₽`;
  return `${nf.format(Math.round(v))}\u00a0₽`;
}

function Bars({ items, unit, values = true }: { items: { key: string; label: string; value: number | null; hot?: boolean }[]; unit?: (v: number) => string; values?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <div className={styles.bars}>
      {items.map((i) => (
        <div key={i.key} className={styles.barCol}>
          {values && <span className={styles.barVal}>{i.value ? (unit ? unit(i.value) : nf.format(Math.round(i.value))) : ''}</span>}
          <div className={styles.barTrack}>
            <div className={`${styles.bar} ${i.hot ? styles.barHot : ''}`} style={{ height: `${i.value ? Math.max(3, (i.value / max) * 100) : 0}%` }} />
          </div>
          <span className={styles.barLabel}>{i.label}</span>
        </div>
      ))}
    </div>
  );
}

const shortK = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}к` : nf.format(Math.round(v)));

function Foodcost({ value, label }: { value: number | null; label: string }) {
  return (
    <div className={styles.fcRow}>
      <span className={styles.label}>{label}</span>
      <span className={styles.fcVal}>{fcText(value)}</span>
      <span className={styles.fcTrack} aria-hidden="true">
        {value != null && <span className={styles.fcFill} style={{ width: `${Math.min(100, (value / FC_SCALE) * 100)}%` }} />}
        <span className={styles.fcNorm} style={{ left: `${(FOODCOST_NORM / FC_SCALE) * 100}%` }} />
      </span>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.label}>{label}</span>
      <span className={styles.statVal}>{value}</span>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  );
}

function Rows({ rows }: { rows: { key: string; name: string; note?: string; value: string }[] }) {
  return (
    <ol className={styles.rows}>
      {rows.map((r, i) => (
        <li key={r.key} className={styles.row}>
          <span className={styles.rank}>{i + 1}</span>
          <span className={styles.rowName}>{r.name}{r.note && <span className={styles.rowNote}>{r.note}</span>}</span>
          <span className={styles.rowVal}>{r.value}</span>
        </li>
      ))}
    </ol>
  );
}

const NoData = ({ text }: { text: string }) => <p className={styles.noData}>{text}</p>;

/** Сводка: всё главное по точке на одном экране — без прокрутки и переключения вкладок */
function Overview({ p }: { p: TvPoint }) {
  const todayWd = (new Date().getUTCDay() + 6) % 7; // по Москве день совпадает почти всегда; точность здесь не критична
  const usual = p.weekdays[todayWd]?.revenue ?? null;
  const v = p.voidsTotal;
  return (
    <div className={styles.ov}>
      <div className={styles.ovKpis}>
        <div className={styles.ovMain}>
          <span className={styles.label}>Выручка сегодня</span>
          <span className={styles.ovHero}>{money(p.revenue)}</span>
          {usual ? <span className={styles.ovNote}>обычно за {p.weekdays[todayWd].label.toLowerCase()} — {money(usual)}</span> : null}
        </div>
        <div className={styles.ovSide}>
          <div className={styles.ovMini}><span className={styles.label}>Покупателей</span><b>{p.checks ? nf.format(p.checks) : '—'}</b></div>
          <div className={styles.ovMini}><span className={styles.label}>Средний чек</span><b>{p.checks > 0 ? money(p.revenue / p.checks) : '—'}</b></div>
        </div>
      </div>

      <Foodcost value={p.foodcost} label="Фудкост" />

      <div className={styles.ovLine}>
        <span>Нал <b>{money(p.cash)}</b></span>
        <span>Безнал <b>{money(p.card)}</b></span>
        <span>Склад <b>{money(p.buy)}</b></span>
        <span>Мясо <b>{p.meat ? money(p.meat) : '—'}</b></span>
      </div>

      <div className={styles.ovHours}>
        {p.hours.length ? (
          <>
            <span className={styles.label}>По часам{p.peakHour ? ` · пик ${p.peakHour.hour}:00–${p.peakHour.hour + 1}:00, ${money(p.peakHour.revenue)}` : ''}</span>
            <Bars values={false} items={p.hours.map((h) => ({ key: String(h.hour), label: String(h.hour), value: h.revenue, hot: p.peakHour?.hour === h.hour }))} />
          </>
        ) : <span className={styles.ovEmpty}>По часам — касса за сегодня ещё ничего не прислала</span>}
      </div>

      <div className={styles.ovCols}>
        <div className={styles.ovCol}>
          <span className={styles.label}>Топ блюд сегодня</span>
          {p.topDishes.length ? (
            <ol className={styles.ovList}>
              {p.topDishes.map((d, i) => (
                <li key={d.dish}><span className={styles.ovRank}>{i + 1}</span><span className={styles.ovName}>{d.dish}</span><b>{money(d.revenue)}</b></li>
              ))}
            </ol>
          ) : <span className={styles.ovEmpty}>Нет данных от кассы</span>}
        </div>
        <div className={styles.ovCol}>
          <span className={styles.label}>С начала месяца</span>
          <ul className={styles.ovList}>
            <li><span className={styles.ovName}>Выручка</span><b>{money(p.month.revenue)}</b></li>
            <li><span className={styles.ovName}>Фудкост</span><b className={styles[`fc_${fcZone(p.month.foodcost)}`]}>{fcText(p.month.foodcost)}</b></li>
            <li><span className={styles.ovName}>Склад + мясо</span><b>{money(p.month.buy + p.month.meat)}</b></li>
            <li><span className={styles.ovName}>Удалено / возвраты</span><b>{v.deletedCount || v.returnsCount ? `${v.deletedCount} / ${v.returnsCount}` : '—'}</b></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function PointCard({ p, screen }: { p: TvPoint; screen: ScreenId }) {
  const zone = fcZone(screen === 'month' ? p.month.foodcost : p.foodcost);
  return (
    <section className={`${styles.card} ${styles[`zone_${zone}`]}`}>
      <header className={styles.cardHead}>
        <h2 className={styles.name}>{p.name}</h2>
        {(screen === 'overview' || screen === 'reports' || screen === 'sales') && (
          <span className={styles.badges}>
            {screen === 'overview' && p.mismatch != null && <span className={styles.badgeWarn}>Расхождение {money(Math.abs(p.mismatch))}</span>}
            <span className={p.reported ? styles.badgeGood : styles.badgeBad}>{p.reported ? 'Отчёт сдан' : 'Отчёт не сдан'}</span>
          </span>
        )}
      </header>

      {screen === 'overview' && <Overview p={p} />}

      {screen === 'reports' && (
        <div className={styles.body}>
          <div>
            <span className={styles.label}>Выручка сегодня</span>
            <div className={styles.hero}>{money(p.revenue)}</div>
          </div>
          <div className={styles.stats}>
            <Stat label="Наличные" value={money(p.cash)} />
            <Stat label="Безнал" value={money(p.card)} />
          </div>
          <Foodcost value={p.foodcost} label="Фудкост" />
          <footer className={styles.foot2}>
            <span>Склад {money(p.buy)}</span>
            <span>Мясо {p.meat ? money(p.meat) : '—'}</span>
            {p.mismatch != null && <span className={styles.warnText}>Отчёт расходится с кассой на {money(Math.abs(p.mismatch))}</span>}
          </footer>
        </div>
      )}

      {screen === 'sales' && (
        <div className={styles.body}>
          <div>
            <span className={styles.label}>Покупателей сегодня</span>
            <div className={styles.hero}>{p.checks ? nf.format(p.checks) : '—'}</div>
          </div>
          <div className={styles.stats}>
            <Stat label="Средний чек" value={p.checks > 0 ? money(p.revenue / p.checks) : '—'} />
            <Stat label="Выручка" value={money(p.revenue)} />
          </div>
        </div>
      )}

      {screen === 'hours' && (p.hours.length === 0 ? <NoData text="Касса за сегодня ещё ничего не прислала." /> : (
        <div className={styles.body}>
          {p.peakHour && <p className={styles.lead}>Пик — <b>{p.peakHour.hour}:00–{p.peakHour.hour + 1}:00</b>, {money(p.peakHour.revenue)}</p>}
          <Bars unit={shortK} items={p.hours.map((h) => ({ key: String(h.hour), label: String(h.hour), value: h.revenue, hot: p.peakHour?.hour === h.hour }))} />
        </div>
      ))}

      {screen === 'dishes' && (p.topDishes.length === 0 ? <NoData text="Касса за сегодня ещё ничего не прислала." /> : (
        <div className={styles.body}>
          <span className={styles.label}>Больше всего выручки сегодня</span>
          <Rows rows={p.topDishes.map((d) => ({ key: d.dish, name: d.dish, note: `${nf.format(d.qty)} шт.`, value: money(d.revenue) }))} />
        </div>
      ))}

      {screen === 'month' && (
        <div className={styles.body}>
          <div>
            <span className={styles.label}>Выручка с начала месяца</span>
            <div className={styles.hero}>{money(p.month.revenue)}</div>
          </div>
          <Foodcost value={p.month.foodcost} label="Фудкост за месяц" />
          <footer className={styles.foot2}>
            <span>Склад {money(p.month.buy)}</span>
            <span>Мясо {p.month.meat ? money(p.month.meat) : '—'}</span>
          </footer>
        </div>
      )}

      {screen === 'week' && (p.weekdays.every((w) => !w.revenue) ? <NoData text="Касса за этот месяц ещё ничего не прислала." /> : (
        <div className={styles.body}>
          <p className={styles.lead}>Средняя выручка по дням недели за месяц</p>
          <Bars unit={shortK} items={p.weekdays.map((w) => ({ key: w.label, label: w.label, value: w.revenue }))} />
        </div>
      ))}

      {screen === 'cashiers' && (p.topCashiers.length === 0 ? <NoData text="Касса за этот месяц ещё ничего не прислала." /> : (
        <div className={styles.body}>
          <span className={styles.label}>Выручка кассиров с начала месяца</span>
          <Rows rows={p.topCashiers.map((c) => ({ key: c.cashier, name: c.cashier, note: `${nf.format(c.checks)} чеков`, value: money(c.revenue) }))} />
        </div>
      ))}

      {screen === 'voids' && (
        <div className={styles.body}>
          <span className={styles.label}>С начала месяца</span>
          <div className={styles.stats}>
            <Stat label="Удалено позиций" value={p.voidsTotal.deletedCount ? nf.format(p.voidsTotal.deletedCount) : '—'} sub={p.voidsTotal.deletedCount ? `на ${money(p.voidsTotal.deletedAmount)}` : undefined} />
            <Stat label="Возвратов" value={p.voidsTotal.returnsCount ? nf.format(p.voidsTotal.returnsCount) : '—'} sub={p.voidsTotal.returnsCount ? `на ${money(p.voidsTotal.returnsAmount)}` : undefined} />
          </div>
        </div>
      )}
    </section>
  );
}

/** Крупные цифры за сегодня по точкам, без входа. Экран сам обновляет данные; какой вид показывать — выбирают стрелками или кликом по вкладке. */
export function TvScreen({ token, name, initialDay, initialPoints }: { token: string; name: string; initialDay: string; initialPoints: TvPoint[] }) {
  const [day, setDay] = useState(initialDay);
  const [points, setPoints] = useState(initialPoints);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [screen, setScreen] = useState<ScreenId>('overview');

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch(`/api/tv/${token}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.ok) {
          setDay(data.day);
          setPoints(data.points);
          setStale(false);
          setUpdatedAt(new Date());
        } else {
          setStale(true);
        }
      } catch {
        setStale(true);
      }
    }
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [token]);

  // Пульт ТВ шлёт обычные стрелки — переключаем вкладку ими же, без таймера.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const i = SCREENS.findIndex((s) => s.id === screen);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setScreen(SCREENS[(i + 1) % SCREENS.length].id);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setScreen(SCREENS[(i - 1 + SCREENS.length) % SCREENS.length].id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <h1>{name}</h1>
        <nav className={styles.tabs} aria-label="Какой экран показать">
          {SCREENS.map((s) => (
            <button key={s.id} type="button" className={`${styles.tab} ${screen === s.id ? styles.tabOn : ''}`} onClick={() => setScreen(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>
        <div className={styles.headRight}>
          <span>{dayTitle(day)}</span>
          <Clock />
          {stale && <span className={styles.warn} title="Не удалось обновить данные, показаны последние известные">⚠</span>}
        </div>
      </header>
      <div className={styles.grid}>
        {points.length === 0 && <p className={styles.empty}>Нет активных точек.</p>}
        {/* key включает screen: при смене вкладки React полностью пересоздаёт DOM карточки,
            а не патчит её на месте — на слабых браузерах дешёвых Smart TV патч иногда
            не до конца очищает старые пиксели, и виден «призрак» прошлой вкладки поверх новой. */}
        {points.map((p) => <PointCard key={`${p.id}:${screen}`} p={p} screen={screen} />)}
      </div>
      <p className={styles.foot}>Обновлено в {updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })} · обновляется каждую минуту</p>
    </main>
  );
}

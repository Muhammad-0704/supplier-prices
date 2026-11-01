'use client';
import { useEffect, useState } from 'react';
import { dayTitle } from '@/lib/canteens';
import { FOODCOST_NORM, fcText, fcZone, shortMoney } from '@/lib/canteens-view';
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
  { id: 'reports', label: 'Отчёты' },
  { id: 'sales', label: 'Продажи' },
  { id: 'hours', label: 'По часам' },
  { id: 'dishes', label: 'Блюда' },
  { id: 'month', label: 'Месяц' },
  { id: 'week', label: 'Неделя' },
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

function HourBars({ hours }: { hours: TvHour[] }) {
  const max = Math.max(1, ...hours.map((h) => h.revenue));
  return (
    <div className={styles.bars}>
      {hours.map((h) => (
        <div key={h.hour} className={styles.barCol}>
          <div className={styles.barTrack}><div className={styles.bar} style={{ height: `${Math.max(2, (h.revenue / max) * 100)}%` }} /></div>
          <span className={styles.barLabel}>{h.hour}</span>
        </div>
      ))}
    </div>
  );
}

function WeekdayBars({ weekdays }: { weekdays: TvWeekday[] }) {
  const max = Math.max(1, ...weekdays.map((w) => w.revenue ?? 0));
  return (
    <div className={styles.bars}>
      {weekdays.map((w) => (
        <div key={w.label} className={styles.barCol}>
          <div className={styles.barTrack}><div className={styles.bar} style={{ height: `${w.revenue ? Math.max(2, (w.revenue / max) * 100) : 2}%` }} /></div>
          <span className={styles.barLabel}>{w.label}</span>
        </div>
      ))}
    </div>
  );
}

function PointCard({ p, screen }: { p: TvPoint; screen: ScreenId }) {
  const zone = fcZone(p.foodcost);
  return (
    <section className={`${styles.card} ${styles[`zone_${zone}`]}`}>
      <h2 className={styles.name}>{p.name}</h2>

      {screen === 'reports' && (
        <>
          <div className={styles.revenue}>{shortMoney(p.revenue)} ₽</div>
          <div className={styles.fc}>{fcText(p.foodcost)}</div>
          {p.foodcost != null && (
            <div className={styles.fcTrack}>
              <div className={styles.fcFill} style={{ width: `${Math.min(100, (p.foodcost / FC_SCALE) * 100)}%` }} />
              <div className={styles.fcNorm} style={{ left: `${(FOODCOST_NORM / FC_SCALE) * 100}%` }} />
            </div>
          )}
          <div className={styles.cashRow}>
            <div className={styles.cashBlock}><span className={styles.cashLabel}>Наличные</span><span className={styles.cashVal}>{shortMoney(p.cash)} ₽</span></div>
            <div className={styles.cashBlock}><span className={styles.cashLabel}>Безнал</span><span className={styles.cashVal}>{shortMoney(p.card)} ₽</span></div>
          </div>
          <div className={styles.statusRow}>
            <span className={p.reported ? styles.badgeGood : styles.badgeBad}>{p.reported ? 'Отчёт сдан' : 'Отчёт не сдан'}</span>
            {p.mismatch != null && <span className={styles.badgeWarn}>Расхождение с кассой {shortMoney(Math.abs(p.mismatch))} ₽</span>}
          </div>
          <div className={styles.sub}><span>Склад {shortMoney(p.buy)} ₽</span><span>Мясо {shortMoney(p.meat)} ₽</span></div>
        </>
      )}

      {screen === 'sales' && (
        <>
          <div className={styles.revenue}>{shortMoney(p.revenue)} ₽</div>
          <div className={styles.cashRow}>
            <div className={styles.cashBlock}><span className={styles.cashLabel}>Чеков</span><span className={styles.cashVal}>{p.checks || '—'}</span></div>
            <div className={styles.cashBlock}><span className={styles.cashLabel}>Средний чек</span><span className={styles.cashVal}>{p.checks > 0 ? `${shortMoney(p.revenue / p.checks)} ₽` : '—'}</span></div>
          </div>
        </>
      )}

      {screen === 'hours' && (
        p.hours.length === 0 ? <p className={styles.noData}>Нет данных от кассы за сегодня.</p> : (
          <>
            {p.peakHour && <div className={styles.peak}>Пик: {p.peakHour.hour}:00 — {shortMoney(p.peakHour.revenue)} ₽</div>}
            <HourBars hours={p.hours} />
          </>
        )
      )}

      {screen === 'dishes' && (
        p.topDishes.length === 0 ? <p className={styles.noData}>Нет данных от кассы за сегодня.</p> : (
          <div className={styles.dishList}>
            {p.topDishes.map((d, i) => (
              <div key={d.dish} className={styles.dishRow}>
                <span className={styles.dishRank}>{i + 1}</span>
                <span className={styles.dishName}>{d.dish}</span>
                <span className={styles.dishVal}>{shortMoney(d.revenue)} ₽</span>
              </div>
            ))}
          </div>
        )
      )}

      {screen === 'month' && (
        <>
          <div className={styles.revenue}>{shortMoney(p.month.revenue)} ₽</div>
          <div className={styles.fc}>{fcText(p.month.foodcost)}</div>
          {p.month.foodcost != null && (
            <div className={styles.fcTrack}>
              <div className={styles.fcFill} style={{ width: `${Math.min(100, (p.month.foodcost / FC_SCALE) * 100)}%` }} />
              <div className={styles.fcNorm} style={{ left: `${(FOODCOST_NORM / FC_SCALE) * 100}%` }} />
            </div>
          )}
          <div className={styles.sub}><span>Склад {shortMoney(p.month.buy)} ₽</span><span>Мясо {shortMoney(p.month.meat)} ₽</span></div>
        </>
      )}

      {screen === 'week' && (
        p.weekdays.every((w) => !w.revenue) ? <p className={styles.noData}>Нет данных от кассы за эту неделю.</p> : <WeekdayBars weekdays={p.weekdays} />
      )}

      {screen === 'cashiers' && (
        p.topCashiers.length === 0 ? <p className={styles.noData}>Нет данных от кассы за месяц.</p> : (
          <div className={styles.dishList}>
            {p.topCashiers.map((c, i) => (
              <div key={c.cashier} className={styles.dishRow}>
                <span className={styles.dishRank}>{i + 1}</span>
                <span className={styles.dishName}>{c.cashier}</span>
                <span className={styles.dishVal}>{shortMoney(c.revenue)} ₽</span>
              </div>
            ))}
          </div>
        )
      )}

      {screen === 'voids' && (
        <div className={styles.cashRow}>
          <div className={styles.cashBlock}><span className={styles.cashLabel}>Удалено за месяц</span><span className={styles.cashVal}>{p.voidsTotal.deletedCount || '—'}</span><span className={styles.cashSub}>{shortMoney(p.voidsTotal.deletedAmount)} ₽</span></div>
          <div className={styles.cashBlock}><span className={styles.cashLabel}>Возвраты за месяц</span><span className={styles.cashVal}>{p.voidsTotal.returnsCount || '—'}</span><span className={styles.cashSub}>{shortMoney(p.voidsTotal.returnsAmount)} ₽</span></div>
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
  const [screen, setScreen] = useState<ScreenId>('reports');

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

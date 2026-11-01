'use client';
import { useEffect, useRef, useState } from 'react';
import { dayTitle } from '@/lib/canteens';
import { fcText, fcZone, shortMoney } from '@/lib/canteens-view';
import styles from './tv.module.css';

export interface TvPoint {
  id: string; name: string;
  revenue: number; foodcost: number | null; buy: number; meat: number;
  cash: number; card: number;
  reported: boolean;
  mismatch: number | null;
}

const POLL_MS = 60_000;
/** Смена экранов: выручка+фудкост <-> наличные/безнал+отчёт. */
const SLIDE_MS = 12_000;
const SLIDES = 2;

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className={styles.clock}>{now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })}</span>;
}

/** Крупные цифры за сегодня по точкам, без входа — экран обновляет и переключает себя сам. */
export function TvScreen({ token, name, initialDay, initialPoints }: { token: string; name: string; initialDay: string; initialPoints: TvPoint[] }) {
  const [day, setDay] = useState(initialDay);
  const [points, setPoints] = useState(initialPoints);
  const [stale, setStale] = useState(false);
  const [slide, setSlide] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch(`/api/tv/${token}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.ok) {
          setDay(data.day);
          setPoints(data.points);
          setStale(false);
        } else {
          setStale(true);
        }
      } catch {
        setStale(true);
      }
    }
    timer.current = setInterval(poll, POLL_MS);
    return () => clearInterval(timer.current);
  }, [token]);

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES), SLIDE_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <h1>{name}</h1>
        <div className={styles.headRight}>
          <span>{dayTitle(day)}</span>
          <Clock />
          {stale && <span className={styles.warn} title="Не удалось обновить данные, показаны последние известные">⚠</span>}
        </div>
      </header>
      <div className={styles.grid}>
        {points.length === 0 && <p className={styles.empty}>Нет активных точек.</p>}
        {points.map((p) => {
          const zone = fcZone(p.foodcost);
          return (
            <section key={p.id} className={`${styles.card} ${styles[`zone_${zone}`]}`}>
              <h2 className={styles.name}>{p.name}</h2>
              {slide === 0 ? (
                <>
                  <div className={styles.revenue}>{shortMoney(p.revenue)} ₽</div>
                  <div className={styles.fc}>{fcText(p.foodcost)}</div>
                  <div className={styles.sub}>
                    <span>Склад {shortMoney(p.buy)} ₽</span>
                    <span>Мясо {shortMoney(p.meat)} ₽</span>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.cashRow}>
                    <div className={styles.cashBlock}>
                      <span className={styles.cashLabel}>Наличные</span>
                      <span className={styles.cashVal}>{shortMoney(p.cash)} ₽</span>
                    </div>
                    <div className={styles.cashBlock}>
                      <span className={styles.cashLabel}>Безнал</span>
                      <span className={styles.cashVal}>{shortMoney(p.card)} ₽</span>
                    </div>
                  </div>
                  <div className={styles.statusRow}>
                    <span className={p.reported ? styles.badgeGood : styles.badgeBad}>{p.reported ? 'Отчёт сдан' : 'Отчёт не сдан'}</span>
                    {p.mismatch != null && <span className={styles.badgeWarn}>Расхождение с кассой {shortMoney(Math.abs(p.mismatch))} ₽</span>}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
      {points.length > 0 && (
        <div className={styles.dots} aria-hidden="true">
          {Array.from({ length: SLIDES }).map((_, i) => (
            <span key={i} className={`${styles.dot} ${i === slide ? styles.dotOn : ''}`} />
          ))}
        </div>
      )}
    </main>
  );
}

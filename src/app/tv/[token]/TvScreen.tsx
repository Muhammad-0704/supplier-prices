'use client';
import { useEffect, useRef, useState } from 'react';
import { dayTitle } from '@/lib/canteens';
import { fcText, fcZone, shortMoney } from '@/lib/canteens-view';
import styles from './tv.module.css';

export interface TvPoint { id: string; name: string; revenue: number; foodcost: number | null; buy: number; meat: number }

const POLL_MS = 60_000;

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className={styles.clock}>{now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })}</span>;
}

/** Крупные цифры за сегодня по точкам, без входа — экран обновляет себя сам. */
export function TvScreen({ token, name, initialDay, initialPoints }: { token: string; name: string; initialDay: string; initialPoints: TvPoint[] }) {
  const [day, setDay] = useState(initialDay);
  const [points, setPoints] = useState(initialPoints);
  const [stale, setStale] = useState(false);
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
              <div className={styles.revenue}>{shortMoney(p.revenue)} ₽</div>
              <div className={styles.fc}>{fcText(p.foodcost)}</div>
              <div className={styles.sub}>
                <span>Склад {shortMoney(p.buy)} ₽</span>
                <span>Мясо {shortMoney(p.meat)} ₽</span>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

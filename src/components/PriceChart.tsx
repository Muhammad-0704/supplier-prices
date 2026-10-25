'use client';
import { longDate, num, rub } from '@/lib/format';
import type { HistoryPoint } from '@/lib/types';

const MONS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DAY = 86_400_000;

function niceStep(x: number) {
  const e = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / e;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e;
}

/** График цен по поставщикам. Цвета series-1…5 идут в том же порядке, что строки таблицы предложений. */
export function PriceChart({ history, order, names }: { history: HistoryPoint[]; order: string[]; names: (id: string) => string }) {
  const W = 560, H = 230, L = 58, R = 16, T = 14, B = 28;
  const pts = history.map((h) => ({ ...h, t: Date.parse(h.date) }));
  const tmin = Math.min(...pts.map((p) => p.t)) - 3 * DAY;
  const tmax = Date.now() + 2 * DAY;
  let pmin = Math.min(...pts.map((p) => p.price));
  let pmax = Math.max(...pts.map((p) => p.price));
  const pad = (pmax - pmin) * 0.15 || pmax * 0.05 || 1;
  pmin = Math.max(0, pmin - pad);
  pmax += pad;
  const step = niceStep((pmax - pmin) / 4);
  const x = (t: number) => L + ((t - tmin) / (tmax - tmin)) * (W - L - R);
  const y = (p: number) => T + (1 - (p - pmin) / (pmax - pmin)) * (H - T - B);

  const ticks: number[] = [];
  for (let v = Math.ceil(pmin / step) * step; v <= pmax; v += step) ticks.push(v);
  const months: number[] = [];
  const d0 = new Date(tmin);
  for (let m = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); m.getTime() < tmax; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) months.push(m.getTime());

  const series = order
    .map((sid, i) => ({ sid, color: `var(--series-${Math.min(i + 1, 5)})`, points: pts.filter((p) => p.supplierId === sid).sort((a, b) => a.t - b.t) }))
    .filter((s) => s.points.length);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="История закупочных цен по поставщикам">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line-soft)" strokeWidth={1} />
          <text x={L - 8} y={y(v) + 3.5} textAnchor="end">{num(v)}</text>
        </g>
      ))}
      {months.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={T} y2={H - B} stroke="var(--line-soft)" strokeWidth={1} strokeDasharray="2 3" />
          <text x={x(t)} y={H - B + 16} textAnchor="middle">{MONS[new Date(t).getMonth()]}</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--line)" strokeWidth={1} />
      {series.map((s) => (
        <g key={s.sid}>
          <polyline points={s.points.map((p) => `${x(p.t).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {s.points.map((p, j) => {
            const last = j === s.points.length - 1;
            return (
              <circle key={j} cx={x(p.t)} cy={y(p.price)} r={last ? 4.2 : 2.6} fill={last ? s.color : 'var(--surface)'} stroke={s.color} strokeWidth={1.6}>
                <title>{`${names(s.sid)}: ${rub(p.price)} · ${longDate(p.date)}${p.docNumber ? ` · ${p.docNumber}` : ''}`}</title>
              </circle>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

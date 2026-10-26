/** Графики «Центра Питания» без библиотек: SVG, цвета из токенов темы. */

const n0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const short = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace('.', ',')} млн` : v >= 1000 ? `${Math.round(v / 1000)} тыс` : n0.format(v));

/** Выручка и закупки по дням месяца: столбик — выручка, засечка — склад + мясо. Высота постоянная на любом экране. */
export function DayChart({ days }: { days: { day: string; revenue: number; shipped: number; hasRevenue: boolean }[] }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.revenue, d.shipped)));
  const W = 1000, H = 160, top = 8;
  const bw = W / days.length;
  const y = (v: number) => top + (H - top) * (1 - v / max);
  return (
    <figure className="cn-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Выручка и закупки по дням">
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className="cn-chart__axis" vectorEffect="non-scaling-stroke" />
        {days.map((d, i) => {
          const x = i * bw;
          const dayNo = Number(d.day.slice(8));
          return (
            <g key={d.day}>
              <title>{`${dayNo}: выручка ${d.hasRevenue ? n0.format(d.revenue) + ' ₽' : 'нет данных'}, закупки ${n0.format(d.shipped)} ₽`}</title>
              {d.hasRevenue && d.revenue > 0 && <rect x={x + bw * 0.18} width={bw * 0.64} y={y(d.revenue)} height={H - y(d.revenue)} className="cn-chart__rev" />}
              {d.shipped > 0 && <line x1={x + bw * 0.08} x2={x + bw * 0.92} y1={y(d.shipped)} y2={y(d.shipped)} className="cn-chart__ship" vectorEffect="non-scaling-stroke" />}
            </g>
          );
        })}
      </svg>
      <div className="cn-chart__days" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
        {days.map((d) => { const n = Number(d.day.slice(8)); return <span key={d.day}>{n === 1 || n % 5 === 0 ? n : ''}</span>; })}
      </div>
      <figcaption className="cn-legend">
        <span><i className="cn-legend__rev" /> выручка</span>
        <span><i className="cn-legend__ship" /> закупки (склад + мясо)</span>
        <span className="muted">макс. {short(max)} ₽</span>
      </figcaption>
    </figure>
  );
}

/** Сравнение точек: полоса фудкоста (за дни с выручкой), справа выручка за месяц. */
export function CompareBars({ rows }: { rows: { name: string; foodcost: number | null; days: number; revenue: number }[] }) {
  const max = Math.max(0.01, ...rows.map((r) => r.foodcost ?? 0));
  const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);
  return (
    <div className="cn-compare" role="list" aria-label="Фудкост по точкам">
      {rows.map((r) => (
        <div key={r.name} className="cn-compare__row" role="listitem">
          <span className="cn-compare__name">{r.name}</span>
          <span className="cn-compare__bar">
            {r.foodcost != null && <i style={{ width: `${(r.foodcost / max) * 100}%` }} className="cn-compare__fc" />}
          </span>
          <span className="cn-compare__val num">{pct(r.foodcost)}{r.days > 0 && <span className="muted"> · {r.days} дн.</span>}</span>
          <span className="cn-compare__rev num muted">{r.revenue > 0 ? `${short(r.revenue)} ₽` : 'нет выручки'}</span>
        </div>
      ))}
    </div>
  );
}

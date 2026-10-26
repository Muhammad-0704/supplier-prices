/** Графики «Столовых» без библиотек: SVG, цвета из токенов темы. */

const n0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const short = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace('.', ',')} млн` : v >= 1000 ? `${Math.round(v / 1000)} тыс` : n0.format(v));

/** Выручка и отгрузки со склада по дням месяца: столбик — выручка, засечка — склад. */
export function DayChart({ days }: { days: { day: string; revenue: number; shipped: number; reported: boolean }[] }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.revenue, d.shipped)));
  const W = 640, H = 170, top = 10, bottom = 22, left = 4, right = 4;
  const bw = (W - left - right) / days.length;
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  return (
    <figure className="cn-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Выручка и отгрузки со склада по дням">
        <line x1={left} x2={W - right} y1={H - bottom} y2={H - bottom} className="cn-chart__axis" />
        {days.map((d, i) => {
          const x = left + i * bw;
          const dayNo = Number(d.day.slice(8));
          return (
            <g key={d.day}>
              <title>{`${dayNo}: выручка ${d.reported ? n0.format(d.revenue) + ' ₽' : 'нет отчёта'}, склад ${n0.format(d.shipped)} ₽`}</title>
              {d.reported && d.revenue > 0 && <rect x={x + bw * 0.15} width={bw * 0.7} y={y(d.revenue)} height={H - bottom - y(d.revenue)} rx={2} className="cn-chart__rev" />}
              {d.shipped > 0 && <rect x={x + bw * 0.05} width={bw * 0.9} y={y(d.shipped) - 1.5} height={3} rx={1.5} className="cn-chart__ship" />}
              {(dayNo === 1 || dayNo % 5 === 0) && <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="cn-chart__label">{dayNo}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="cn-legend">
        <span><i className="cn-legend__rev" /> выручка</span>
        <span><i className="cn-legend__ship" /> отгружено со склада</span>
        <span className="muted">макс. {short(max)} ₽</span>
      </figcaption>
    </figure>
  );
}

/** Сравнение точек: горизонтальные полосы фудкоста, подпись — выручка за месяц. */
export function CompareBars({ rows, realLabel }: { rows: { name: string; foodcost: number | null; real: number | null; revenue: number }[]; realLabel?: boolean }) {
  const max = Math.max(0.01, ...rows.map((r) => Math.max(r.foodcost ?? 0, r.real ?? 0)));
  const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);
  return (
    <div className="cn-compare" role="list" aria-label="Фудкост по точкам">
      {rows.map((r) => (
        <div key={r.name} className="cn-compare__row" role="listitem">
          <span className="cn-compare__name">{r.name}</span>
          <span className="cn-compare__bar">
            {r.foodcost != null && <i style={{ width: `${(r.foodcost / max) * 100}%` }} className="cn-compare__fc" title={`Фудкост ${pct(r.foodcost)}`} />}
            {r.real != null && <i style={{ width: `${(r.real / max) * 100}%` }} className="cn-compare__real" title={`Реальный фудкост ${pct(r.real)}`} />}
          </span>
          <span className="cn-compare__val num">{pct(r.foodcost)}{realLabel && r.real != null && <span className="muted"> · {pct(r.real)}</span>}</span>
          <span className="cn-compare__rev num muted">{r.revenue > 0 ? `${short(r.revenue)} ₽` : 'нет отчётов'}</span>
        </div>
      ))}
    </div>
  );
}

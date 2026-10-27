import { FOODCOST_NORM, fcText, fcZone } from '@/lib/canteens-view';

/** Шкала 0–60%: полоса фудкоста, отметка нормы 40%. Цвет — зона. */
const SCALE = 0.6;

export function FoodcostBar({ value, days }: { value: number | null; days?: number }) {
  const zone = fcZone(value);
  const w = value == null ? 0 : Math.min(1, value / SCALE) * 100;
  return (
    <span className={`fc fc--${zone}`}>
      <span className="fc__val num">{fcText(value)}</span>
      <span className="fc__track" aria-hidden="true">
        {value != null && <span className="fc__fill" style={{ width: `${w}%` }} />}
        <span className="fc__norm" style={{ left: `${(FOODCOST_NORM / SCALE) * 100}%` }} />
      </span>
      {days !== undefined && <span className="fc__days">{days > 0 ? `${days} дн.` : ''}</span>}
    </span>
  );
}

export function FoodcostLegend() {
  return (
    <p className="fc-legend">
      <span><i className="fc-dot fc-dot--good" /> до 35%</span>
      <span><i className="fc-dot fc-dot--norm" /> 35–40%</span>
      <span><i className="fc-dot fc-dot--high" /> выше 40%</span>
      <span className="muted">Черта на шкале — норма 40%. Фудкост считается за дни, где известна выручка.</span>
    </p>
  );
}

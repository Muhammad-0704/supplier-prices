import Link from 'next/link';
import type { PointView, TotalView } from '@/lib/canteens-view';
import { shortMoney } from '@/lib/canteens-view';
import { num } from '@/lib/format';
import { FoodcostBar, FoodcostLegend } from './Foodcost';
import { MonthNav } from './MonthNav';

export interface OverviewProps {
  month: string;
  points: PointView[];
  total: TotalView;
  /** Сдан ли отчёт за сегодня — только для текущего месяца */
  today: { id: string; done: boolean }[] | null;
  /** Точки без привязанного покупателя 1С */
  unlinked: Set<string>;
  byCost: boolean;
  toolbar: React.ReactNode;
}

const pctInt = (v: number) => `${Math.round(v * 100)}%`;

/** Чеки и средний чек из iiko за месяц (только дни, где iiko отдал чеки) */
function checksOf(p: PointView): { checks: number; avg: number | null } {
  let checks = 0, rev = 0;
  for (const d of p.byDay.values()) if (d.source === 'iiko' && d.checks > 0) { checks += d.checks; rev += d.revenue; }
  return { checks, avg: checks ? rev / checks : null };
}
const checksHint = (p: PointView) => { const c = checksOf(p); return c.checks ? `${num(c.checks)} чеков · ср. ${num(c.avg!)} ₽` : null; };

/** Месяц по всем точкам: итог в четырёх цифрах и одна таблица, где фудкост виден шкалой. */
export function Overview({ month, points, total, today, unlinked, byCost, toolbar }: OverviewProps) {
  const done = today?.filter((t) => t.done).length ?? 0;
  const missing = today ? points.filter((p) => !today.find((t) => t.id === p.id)?.done).map((p) => p.name) : [];
  const status = new Map(today?.map((t) => [t.id, t.done]) ?? []);
  const sorted = [...points].sort((a, b) => b.revenue - a.revenue || b.buy - a.buy);

  return (
    <>
      <div className="cn-toolbar">
        <MonthNav month={month} base="/canteens" />
        <div className="cn-toolbar__right">
          {toolbar}
          <a className="pb-btn pb-btn--sm" href={`/canteens/export?month=${month}`} download>Скачать Excel</a>
        </div>
      </div>

      <section className="kpi" aria-label="Итог месяца">
        <div className="kpi__item">
          <span className="kpi__label">Выручка</span>
          <span className="kpi__value num">{total.revenue ? shortMoney(total.revenue) : '—'}<small> ₽</small></span>
          <span className="kpi__sub">{total.revenue ? `наличные ${pctInt(total.cash / total.revenue)}, безнал ${pctInt(total.card / total.revenue)}` : 'отчётов ещё нет'}</span>
        </div>
        <div className="kpi__item">
          <span className="kpi__label">Закупки</span>
          <span className="kpi__value num">{shortMoney(total.buy + total.meat)}<small> ₽</small></span>
          <span className="kpi__sub">склад {shortMoney(total.buy)}{byCost ? ' по закупочным' : ''}, мясо {shortMoney(total.meat)}</span>
        </div>
        <div className="kpi__item kpi__item--fc">
          <span className="kpi__label">Фудкост</span>
          <FoodcostBar value={total.foodcost} />
          <span className="kpi__sub">доля выручки, ушедшая на продукты</span>
        </div>
        {today && (
          <div className="kpi__item">
            <span className="kpi__label">Отчёты за сегодня</span>
            <span className="kpi__value num">{done}<small> из {today.length}</small></span>
            <span className={`kpi__sub ${missing.length ? 'kpi__sub--warn' : ''}`}>{missing.length ? `не сдали: ${missing.join(', ')}` : 'все точки сдали'}</span>
          </div>
        )}
      </section>

      <section className="card-box cn-points">
        <div className="cn-scroll">
          <table className="cn-table cn-table--points">
            <thead>
              <tr>
                <th>Точка</th>
                {today && <th>Сегодня</th>}
                <th className="r">Выручка</th>
                <th className="r" title={byCost ? 'Отгружено со склада по закупочным ценам' : 'Отгружено со склада по ценам расходных'}>Склад</th>
                <th className="r" title="Мясо из ежедневных отчётов">Мясо</th>
                <th className="cn-fc-col">Фудкост</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/canteens/${p.id}?month=${month}`} className="cn-point">{p.name}</Link>
                    {unlinked.has(p.id) && <span className="cn-hint">нет покупателя в 1С</span>}
                  </td>
                  {today && (
                    <td>
                      <span className={`dot ${status.get(p.id) ? 'dot--ok' : 'dot--miss'}`}>{status.get(p.id) ? 'сдан' : 'нет отчёта'}</span>
                    </td>
                  )}
                  <td className="r num">{p.revenue ? num(p.revenue) : <span className="muted">—</span>}{checksHint(p) && <Link href={`/canteens/${p.id}/sales?month=${month}`} className="cn-hint">{checksHint(p)}</Link>}</td>
                  <td className="r num">{num(p.buy)}</td>
                  <td className="r num">{p.meat ? num(p.meat) : <span className="muted">—</span>}</td>
                  <td className="cn-fc-col"><FoodcostBar value={p.foodcost} days={p.fcDays} /></td>
                </tr>
              ))}
            </tbody>
            {points.length > 1 && (
              <tfoot>
                <tr>
                  <td>Все точки</td>
                  {today && <td />}
                  <td className="r num">{num(total.revenue)}</td>
                  <td className="r num">{num(total.buy)}</td>
                  <td className="r num">{num(total.meat)}</td>
                  <td className="cn-fc-col"><FoodcostBar value={total.foodcost} days={0} /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <ul className="cn-cards" aria-label="Точки">
          {sorted.map((p) => (
            <li key={p.id}>
              <Link href={`/canteens/${p.id}?month=${month}`} className="cn-card">
                <span className="cn-card__head">
                  <span className="cn-point">{p.name}</span>
                  {today && <span className={`dot ${status.get(p.id) ? 'dot--ok' : 'dot--miss'}`}>{status.get(p.id) ? 'сдан' : 'нет отчёта'}</span>}
                </span>
                <FoodcostBar value={p.foodcost} days={p.fcDays} />
                <span className="cn-card__nums">
                  <span><small>Выручка</small>{p.revenue ? shortMoney(p.revenue) : '—'}{checksHint(p) && <small>{checksHint(p)}</small>}</span>
                  <span><small>Склад</small>{shortMoney(p.buy)}</span>
                  <span><small>Мясо</small>{p.meat ? shortMoney(p.meat) : '—'}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <FoodcostLegend />
      </section>
    </>
  );
}

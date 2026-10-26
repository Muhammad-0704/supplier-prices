import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CanteenHeader } from '@/components/canteens/CanteenHeader';
import { CompareBars } from '@/components/canteens/Charts';
import { MonthNav } from '@/components/canteens/MonthNav';
import { SyncNote } from '@/components/canteens/SyncNote';
import { requireCanteens } from '@/lib/access';
import { isMonth, mskDay, mskMonth, summarize } from '@/lib/canteens';
import { costTotals, customerMap, loadCanteens, loadCostSummary, loadIiko, loadReports, loadShipments, loadSyncState } from '@/lib/canteens-data';
import { buildViews, fcText as fc, totalView } from '@/lib/canteens-view';
import { num, pct, plural, syncLabel } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Все точки за месяц: руководитель видит все и общий итог; админ — свои (одна точка — сразу её страница). */
export default async function CanteensPage({ searchParams }: { searchParams: { month?: string } }) {
  const me = await requireCanteens();
  const db = createClient();
  const canteens = await loadCanteens(db);
  if (me.canteenRole === 'admin' && canteens.length === 1) redirect(`/canteens/${canteens[0].id}`);

  const month = isMonth(searchParams.month) ? searchParams.month : mskMonth();
  const manager = me.canteenRole === 'manager';
  const [shipments, reports, sync, costRows, iiko] = await Promise.all([
    loadShipments(db, canteens, month), loadReports(db, canteens, month), loadSyncState(db),
    manager ? loadCostSummary(db, month).catch(() => []) : Promise.resolve([]),
    loadIiko(db, canteens, month),
  ]);
  const iikoState = manager ? await loadSyncState(db, 'iiko') : null;
  const totals = summarize(canteens.map((c) => c.id), customerMap(canteens), shipments, reports, iiko);
  // Руководитель видит склад по закупочным ценам, админ — по ценам расходных
  const points = buildViews(canteens, totals, manager ? costTotals(costRows) : null);
  const all = totalView(points);
  const byCost = manager && costRows.length > 0;
  const today = mskDay(Date.now());
  const isCurrent = month === mskMonth();

  return (
    <main className="page">
      <CanteenHeader me={me} current="points" />
      <SyncNote at={sync?.at ?? null} ok={sync?.ok ?? true} message={sync?.message ?? null} />

      {canteens.length === 0 ? (
        <div className="notice">{manager ? 'Точек пока нет.' : 'Вам ещё не назначили точку. Попросите руководителя открыть её в разделе «Доступы».'}</div>
      ) : (
        <>
          {isCurrent && (
            <section className="card-box">
              <h2>Отчёт за сегодня</h2>
              <div className="cn-today">
                {canteens.map((c) => {
                  const done = totals.get(c.id)?.byDay.get(today)?.reported;
                  return (
                    <Link key={c.id} href={`/canteens/${c.id}`} className={`cn-pill ${done ? 'cn-pill--done' : ''}`}>
                      <span aria-hidden="true">{done ? '✓' : '·'}</span> {c.name}
                      <span className="sr-only">{done ? ' — сдан' : ' — не сдан'}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          <section className="card-box">
            <div className="cn-head">
              <h2>По точкам</h2>
              <div className="cn-actions">
                <a className="pb-btn pb-btn--sm" href={`/canteens/export?month=${month}`} download>Скачать Excel</a>
                <MonthNav month={month} base="/canteens" />
              </div>
            </div>
            <div className="cn-scroll">
              <table className="cn-table">
                <thead>
                  <tr>
                    <th>Точка</th>
                    <th className="r" title={byCost ? 'Отгружено со склада по закупочным ценам' : 'Отгружено со склада по ценам расходных'}>Со склада</th>
                    <th className="r" title="Сумма мяса из ежедневных отчётов (по накладным мясного магазина)">Мясо</th>
                    <th className="r">Наличные</th>
                    <th className="r">Безнал</th>
                    <th className="r">Выручка</th>
                    <th className="r" title="(Склад + мясо) ÷ выручка, за дни с выручкой">Фудкост</th>
                    <th className="r">Отчётов</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.id}>
                      <td><Link href={`/canteens/${p.id}?month=${month}`}>{p.name}</Link>{!canteens.find((c) => c.id === p.id)?.customerIds.length && <span className="muted"> · нет покупателя 1С</span>}</td>
                      <td className="r num">{num(p.buy)}</td>
                      <td className="r num">{p.meat ? num(p.meat) : '—'}</td>
                      <td className="r num">{p.revenue ? num(p.cash) : '—'}</td>
                      <td className="r num">{p.revenue ? num(p.card) : '—'}</td>
                      <td className="r num">{p.revenue ? num(p.revenue) : '—'}</td>
                      <td className="r num" title={p.fcDays ? `За ${p.fcDays} ${plural(p.fcDays, 'день', 'дня', 'дней')} с выручкой` : undefined}>
                        {fc(p.foodcost)}{p.fcDays > 0 && <span className="cn-days-n">{p.fcDays} дн.</span>}
                      </td>
                      <td className="r num">{p.reports}</td>
                    </tr>
                  ))}
                </tbody>
                {points.length > 1 && (
                  <tfoot>
                    <tr>
                      <td>Всего</td>
                      <td className="r num">{num(all.buy)}</td>
                      <td className="r num">{all.meat ? num(all.meat) : '—'}</td>
                      <td className="r num">{all.revenue ? num(all.cash) : '—'}</td>
                      <td className="r num">{all.revenue ? num(all.card) : '—'}</td>
                      <td className="r num">{all.revenue ? num(all.revenue) : '—'}</td>
                      <td className="r num">{fc(all.foodcost)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {iikoState && (
              <p className={`cn-foot ${iikoState.ok ? 'muted' : 'err'}`}>
                {syncLabel(iikoState.at).replace('Синхронизировано с 1С', 'Выручка из iiko обновлена')}{!iikoState.ok && iikoState.message ? ` — ${iikoState.message}` : ''}
              </p>
            )}
            <p className="muted cn-foot">
              Суммы в рублях. Со склада — {byCost ? 'по закупочным ценам (последняя закупка до даты отгрузки)' : 'по ценам расходных накладных'}; мясо — из ежедневных отчётов;
              выручка — из отчётов{iikoState ? ' или iiko' : ''}. Фудкост — доля выручки, ушедшая на продукты: (склад + мясо) ÷ выручка, только за дни, где выручка известна{all.revenue > 0 ? `; доля безнала ${pct(all.card / all.revenue)}` : ''}.
            </p>
          </section>

          {points.length > 1 && all.revenue > 0 && (
            <section className="card-box">
              <h2>Сравнение точек</h2>
              <CompareBars rows={points.map((p) => ({ name: p.name, foodcost: p.foodcost, days: p.fcDays, revenue: p.revenue })).sort((a, b) => (b.foodcost ?? -1) - (a.foodcost ?? -1))} />
              <p className="muted cn-foot">Фудкост точки за дни с выручкой: чем короче полоса, тем меньше выручки уходит на продукты. Справа — выручка за месяц.</p>
            </section>
          )}
        </>
      )}
    </main>
  );
}

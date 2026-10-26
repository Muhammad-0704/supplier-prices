import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CanteenHeader } from '@/components/canteens/CanteenHeader';
import { CompareBars } from '@/components/canteens/Charts';
import { MonthNav } from '@/components/canteens/MonthNav';
import { SyncNote } from '@/components/canteens/SyncNote';
import { requireCanteens } from '@/lib/access';
import { grandTotal, isMonth, markupRate, mskDay, mskMonth, realCost, summarize } from '@/lib/canteens';
import { costTotals, customerMap, loadCanteens, loadCostSummary, loadIiko, loadReports, loadShipments, loadSyncState } from '@/lib/canteens-data';
import { num, pct, syncLabel } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const fc = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);

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
  const costs = costTotals(costRows);
  const costOf = (id: string, shipped: number) => {
    const c = costs.get(id);
    return c ? realCost(shipped, c.costed, c.cost) : null;
  };
  const totals = summarize(canteens.map((c) => c.id), customerMap(canteens), shipments, reports, iiko);
  const all = grandTotal(totals.values());
  const today = mskDay(Date.now());
  const isCurrent = month === mskMonth();
  const withCost = manager && costs.size > 0;
  let allCost = 0, allCosted = 0, allPure = 0;
  for (const c of costs.values()) { allCosted += c.costed; allPure += c.cost; }
  allCost = realCost(all.shipped, allCosted, allPure);

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
                    <th className="r">Со склада</th>
                    <th className="r" title="Сумма мяса из ежедневных отчётов (по накладным мясного магазина)">Мясо</th>
                    <th className="r">Наличные</th>
                    <th className="r">Безнал</th>
                    <th className="r">Выручка</th>
                    <th className="r" title="(Склад + мясо) ÷ выручка">Фудкост</th>
                    {withCost && <th className="r" title="Те же строки по последней закупочной цене">По закупочным</th>}
                    {withCost && <th className="r" title="По расходным ÷ по закупочным − 1">Наценка</th>}
                    {withCost && <th className="r" title="(Склад по закупочным + мясо) ÷ выручка">Реальный фудкост</th>}
                    <th className="r">Отчётов</th>
                  </tr>
                </thead>
                <tbody>
                  {canteens.map((c) => {
                    const t = totals.get(c.id)!;
                    const cost = costOf(c.id, t.shipped);
                    const cc = costs.get(c.id);
                    return (
                      <tr key={c.id}>
                        <td><Link href={`/canteens/${c.id}?month=${month}`}>{c.name}</Link>{!c.customerIds.length && <span className="muted"> · нет покупателя 1С</span>}</td>
                        <td className="r num">{num(t.shipped)}</td>
                        <td className="r num">{t.meat ? num(t.meat) : '—'}</td>
                        <td className="r num">{num(t.cash)}</td>
                        <td className="r num">{num(t.card)}</td>
                        <td className="r num">{num(t.revenue)}</td>
                        <td className="r num">{fc(t.foodcost)}</td>
                        {withCost && <td className="r num">{cost != null ? num(cost) : '—'}</td>}
                        {withCost && <td className="r num">{cc ? fc(markupRate(cc.costed, cc.cost)) : '—'}</td>}
                        {withCost && <td className="r num">{cost != null && t.revenue > 0 ? fc((cost + t.meat) / t.revenue) : '—'}</td>}
                        <td className="r num">{t.reports}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {canteens.length > 1 && (
                  <tfoot>
                    <tr>
                      <td>Всего</td>
                      <td className="r num">{num(all.shipped)}</td>
                      <td className="r num">{all.meat ? num(all.meat) : '—'}</td>
                      <td className="r num">{num(all.cash)}</td>
                      <td className="r num">{num(all.card)}</td>
                      <td className="r num">{num(all.revenue)}</td>
                      <td className="r num">{fc(all.foodcost)}</td>
                      {withCost && <td className="r num">{num(allCost)}</td>}
                      {withCost && <td className="r num">{fc(markupRate(allCosted, allPure))}</td>}
                      {withCost && <td className="r num">{all.revenue > 0 ? fc((allCost + all.meat) / all.revenue) : '—'}</td>}
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
              Суммы в рублях. Со склада — по ценам расходных накладных; мясо — из ежедневных отчётов; выручка — из iiko там, где он подключён, иначе из отчётов; фудкост = (склад + мясо) ÷ выручка{all.revenue > 0 ? `; доля безнала ${pct(all.card / all.revenue)}` : ''}.
              {withCost && ' По закупочным — по последней закупке до даты отгрузки; эти колонки видит только руководитель.'}
            </p>
          </section>

          {canteens.length > 1 && all.revenue > 0 && (
            <section className="card-box">
              <h2>Сравнение точек</h2>
              <CompareBars realLabel={withCost} rows={canteens.map((c) => {
                const t = totals.get(c.id)!;
                const cost = withCost ? costOf(c.id, t.shipped) : null;
                return { name: c.name, foodcost: t.foodcost, real: cost != null && t.revenue > 0 ? (cost + t.meat) / t.revenue : null, revenue: t.revenue };
              }).sort((a, b) => (b.foodcost ?? -1) - (a.foodcost ?? -1))} />
              <p className="muted cn-foot">Полоса — фудкост по расходным{withCost ? ', тёмная линия — реальный фудкост по закупочным' : ''}. Справа выручка за месяц.</p>
            </section>
          )}
        </>
      )}
    </main>
  );
}

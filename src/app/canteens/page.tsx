import { redirect } from 'next/navigation';
import { CanteenHeader } from '@/components/canteens/CanteenHeader';
import { Overview } from '@/components/canteens/Overview';
import { SyncNote } from '@/components/canteens/SyncNote';
import { requireCanteens } from '@/lib/access';
import { isMonth, mskDay, mskMonth, summarize } from '@/lib/canteens';
import { costTotals, customerMap, loadCanteens, loadCostSummary, loadIiko, loadReports, loadShipments, loadSyncState } from '@/lib/canteens-data';
import { buildViews, totalView } from '@/lib/canteens-view';
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
      {canteens.length === 0 ? (
        <div className="notice">{manager ? 'Точек пока нет.' : 'Вам ещё не назначили точку. Попросите руководителя открыть её в разделе «Доступы».'}</div>
      ) : (
        <Overview
          month={month}
          points={points}
          total={all}
          today={isCurrent ? canteens.map((c) => ({ id: c.id, done: !!totals.get(c.id)?.byDay.get(today)?.reported })) : null}
          unlinked={new Set(canteens.filter((c) => !c.customerIds.length).map((c) => c.id))}
          byCost={byCost}
          toolbar={<SyncNote at={sync?.at ?? null} ok={sync?.ok ?? true} message={sync?.message ?? null} />}
        />
      )}
      {iikoState && !iikoState.ok && <p className="cn-foot err">Выручка из iiko не обновилась: {iikoState.message}</p>}
    </main>
  );
}

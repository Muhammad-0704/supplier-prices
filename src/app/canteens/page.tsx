import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CanteenHeader } from '@/components/canteens/CanteenHeader';
import { MonthNav } from '@/components/canteens/MonthNav';
import { SyncNote } from '@/components/canteens/SyncNote';
import { requireCanteens } from '@/lib/access';
import { grandTotal, isMonth, mskDay, mskMonth, summarize } from '@/lib/canteens';
import { customerMap, loadCanteens, loadReports, loadShipments, loadSyncState } from '@/lib/canteens-data';
import { num, pct } from '@/lib/format';
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
  const [shipments, reports, sync] = await Promise.all([loadShipments(db, canteens, month), loadReports(db, canteens, month), loadSyncState(db)]);
  const totals = summarize(canteens.map((c) => c.id), customerMap(canteens), shipments, reports);
  const all = grandTotal(totals.values());
  const today = mskDay(Date.now());
  const isCurrent = month === mskMonth();
  const manager = me.canteenRole === 'manager';

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
              <MonthNav month={month} base="/canteens" />
            </div>
            <div className="cn-scroll">
              <table className="cn-table">
                <thead>
                  <tr>
                    <th>Точка</th>
                    <th className="r">Отгружено со склада</th>
                    <th className="r">Наличные</th>
                    <th className="r">Безнал</th>
                    <th className="r">Выручка</th>
                    <th className="r" title="Отгружено по расходным ÷ выручка">Фудкост</th>
                    <th className="r">Отчётов</th>
                  </tr>
                </thead>
                <tbody>
                  {canteens.map((c) => {
                    const t = totals.get(c.id)!;
                    return (
                      <tr key={c.id}>
                        <td><Link href={`/canteens/${c.id}?month=${month}`}>{c.name}</Link>{!c.customerIds.length && <span className="muted"> · нет покупателя 1С</span>}</td>
                        <td className="r num">{num(t.shipped)}</td>
                        <td className="r num">{num(t.cash)}</td>
                        <td className="r num">{num(t.card)}</td>
                        <td className="r num">{num(t.revenue)}</td>
                        <td className="r num">{fc(t.foodcost)}</td>
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
                      <td className="r num">{num(all.cash)}</td>
                      <td className="r num">{num(all.card)}</td>
                      <td className="r num">{num(all.revenue)}</td>
                      <td className="r num">{fc(all.foodcost)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="muted cn-foot">
              Суммы в рублях. Отгружено — по ценам расходных накладных склада{all.revenue > 0 ? `; доля безнала ${pct(all.card / all.revenue)}` : ''}.
              Мясо добавится следующим шагом.
            </p>
          </section>
        </>
      )}
    </main>
  );
}

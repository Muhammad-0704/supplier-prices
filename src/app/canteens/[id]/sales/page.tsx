import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CanteenHeader } from '@/components/canteens/CanteenHeader';
import { MonthNav } from '@/components/canteens/MonthNav';
import { PointTabs } from '@/components/canteens/PointTabs';
import { Cashiers, Categories, Dishes, FlowChart, Hours, SalesKpi, VoidList, Weekdays } from '@/components/canteens/Sales';
import { requireCanteens } from '@/lib/access';
import { isMonth, monthRange, mskDay, mskMonth } from '@/lib/canteens';
import { loadCanteens, loadIikoDetails, loadSyncState } from '@/lib/canteens-data';
import { byHour, byWeekday, cashiers, flow, menu, voids } from '@/lib/iiko-insights';
import { syncLabel } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Продажи точки за месяц из iiko: поток людей, средний чек, дни недели, часы, блюда; руководителю — кассиры и удаления. */
export default async function SalesPage({ params, searchParams }: { params: { id: string }; searchParams: { month?: string } }) {
  const me = await requireCanteens();
  const db = createClient();
  const all = await loadCanteens(db);
  const canteen = all.find((c) => c.id === params.id);
  if (!canteen) notFound();

  const month = isMonth(searchParams.month) ? searchParams.month : mskMonth();
  const manager = me.canteenRole === 'manager';
  const [d, iikoState] = await Promise.all([loadIikoDetails(db, canteen.id, month, manager), loadSyncState(db, 'iiko')]);
  const today = mskDay(Date.now());
  const days = monthRange(month).days.filter((x) => x <= today);

  const f = flow(d.revenue);
  const m = menu(d.dishes);
  const h = byHour(d.hours);
  const v = d.voids ? voids(d.voids) : null;
  const staff = d.staff ? cashiers(d.staff, d.voids ?? []) : null;
  const empty = f.checks === 0 && m.dishes === 0;
  const others = all.filter((c) => c.id !== canteen.id);

  return (
    <main className="page">
      <CanteenHeader me={me} current="points" />
      <div className="cn-title">
        {(manager || others.length > 0) && <Link href={`/canteens?month=${month}`} className="cn-back">← Все точки</Link>}
        <h2>{canteen.name}</h2>
      </div>
      <PointTabs id={canteen.id} month={month} current="sales" />

      <div className="cn-toolbar">
        <MonthNav month={month} base={`/canteens/${canteen.id}/sales`} />
        <div className="cn-toolbar__right">
          {d.demo ? <span className="sl-demo">Тестовые данные — заменятся настоящими из iiko</span>
            : iikoState ? <span className={`muted ${iikoState.ok ? '' : 'err'}`} style={{ fontSize: 13 }}>{iikoState.ok ? syncLabel(iikoState.at).replace('Синхронизировано с 1С', 'Данные iiko') : `iiko: ${iikoState.message}`}</span> : null}
        </div>
      </div>

      {empty ? (
        <div className="notice">За этот месяц продаж из iiko нет. Они появятся, когда к точке подключат iiko: выручка, чеки, часы, блюда{manager ? ', кассиры и удаления' : ''}.</div>
      ) : (
        <>
          <SalesKpi f={f} menu={m} voids={v} />
          <section className="card-box">
            <h2>Покупатели по дням</h2>
            <FlowChart f={f} days={days} />
          </section>
          <div className="sl-grid">
            <Weekdays rows={byWeekday(d.revenue)} />
            <Hours hours={h.hours} peak={h.peak} />
          </div>
          <Categories menu={m} />
          <Dishes menu={m} />
          {staff && staff.length > 0 && <Cashiers rows={staff} />}
          {v && <VoidList v={v} />}
        </>
      )}
    </main>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CanteenHeader } from '@/components/canteens/CanteenHeader';
import { DayChart } from '@/components/canteens/Charts';
import { MonthNav } from '@/components/canteens/MonthNav';
import { ReportForm, type ReportValue } from '@/components/canteens/ReportForm';
import { SyncNote } from '@/components/canteens/SyncNote';
import { TelegramLink } from '@/components/canteens/TelegramLink';
import { requireCanteens } from '@/lib/access';
import { dayTitle, isMonth, markupRate, monthRange, mskDay, mskMonth, realCost, reportMismatch, summarize } from '@/lib/canteens';
import { chatKey } from '@/lib/canteens-notify';
import { costTotals, customerMap, loadCanteens, loadCostSummary, loadIiko, loadReports, loadShipments, loadSyncState, type ShipmentLineRow } from '@/lib/canteens-data';
import { num, rubFine } from '@/lib/format';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { telegramConfigured } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

const fc = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);
const qtyFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });

/** Точка за месяц: отчёт за день, по дням — отгружено со склада и выручка, внутри дня — накладные и товары. */
export default async function CanteenPage({ params, searchParams }: { params: { id: string }; searchParams: { month?: string } }) {
  const me = await requireCanteens();
  const db = createClient();
  const all = await loadCanteens(db);
  const canteen = all.find((c) => c.id === params.id);
  if (!canteen) notFound();

  const month = isMonth(searchParams.month) ? searchParams.month : mskMonth();
  const manager = me.canteenRole === 'manager';
  const now = Date.now();
  const today = mskDay(now);
  const yesterday = mskDay(now - 86_400_000);

  const [lines, reports, recent, sync, costRows, iiko] = await Promise.all([
    loadShipments(db, [canteen], month, true),
    loadReports(db, [canteen], month),
    db.from('daily_reports').select('report_date, cash, card, meat').eq('canteen_id', canteen.id).gte('report_date', yesterday),
    loadSyncState(db),
    manager ? loadCostSummary(db, month).catch(() => []) : Promise.resolve([]),
    loadIiko(db, [canteen], month),
  ]);
  const cc = costTotals(costRows.filter((r) => r.canteen_id === canteen.id)).get(canteen.id);
  const tgLinked = !manager && telegramConfigured()
    ? !!(await createAdminClient().from('app_settings').select('key').eq('key', chatKey(me.userId)).maybeSingle()).data
    : false;
  const t = summarize([canteen.id], customerMap([canteen]), lines, reports, iiko).get(canteen.id)!;

  const formReports: Record<string, ReportValue> = {};
  for (const r of [...reports, ...(recent.data ?? [])]) formReports[r.report_date] = { cash: Number(r.cash), card: Number(r.card), meat: Number(r.meat ?? 0) };

  // Строки по дням и накладным
  const byDay = new Map<string, Map<string, ShipmentLineRow[]>>();
  for (const l of lines) {
    const d = mskDay(l.doc_date);
    const docs = byDay.get(d) ?? new Map<string, ShipmentLineRow[]>();
    docs.set(l.onec_doc_ref, [...(docs.get(l.onec_doc_ref) ?? []), l]);
    byDay.set(d, docs);
  }
  const days = [...new Set([...t.byDay.keys()])].sort().reverse();
  const others = all.filter((c) => c.id !== canteen.id);

  return (
    <main className="page">
      <CanteenHeader me={me} current="points" />
      <div className="cn-title">
        {(manager || others.length > 0) && <Link href={`/canteens?month=${month}`} className="muted">← Все точки</Link>}
        <h2>{canteen.name}</h2>
        {others.length > 0 && !manager && (
          <nav className="cn-switch" aria-label="Другие точки">
            {others.map((c) => <Link key={c.id} href={`/canteens/${c.id}?month=${month}`} className="pb-chip">{c.name}</Link>)}
          </nav>
        )}
      </div>
      <SyncNote at={sync?.at ?? null} ok={sync?.ok ?? true} message={sync?.message ?? null} />

      <ReportForm canteenId={canteen.id} today={today} minDay={manager ? null : yesterday} reports={formReports} />
      {!manager && telegramConfigured() && <TelegramLink linked={tgLinked} />}

      <section className="card-box">
        <div className="cn-head">
          <h2>По дням</h2>
          <MonthNav month={month} base={`/canteens/${canteen.id}`} />
        </div>
        <div className="pb-stats">
          <div className="pb-stats__item"><span className="pb-stats__label">Закупки</span><span className="pb-stats__value">{num(t.shipped + t.meat)} ₽</span><span className="pb-stats__sub">склад {num(t.shipped)} · мясо {num(t.meat)}</span></div>
          <div className="pb-stats__item"><span className="pb-stats__label">Выручка</span><span className="pb-stats__value">{num(t.revenue)} ₽</span><span className="pb-stats__sub">нал {num(t.cash)} · безнал {num(t.card)}</span></div>
          <div className="pb-stats__item"><span className="pb-stats__label">Фудкост</span><span className="pb-stats__value">{fc(t.foodcost)}</span><span className="pb-stats__sub">(склад + мясо) ÷ выручка</span></div>
          {manager && cc && (() => {
            const real = realCost(t.shipped, cc.costed, cc.cost);
            return (
              <div className="pb-stats__item">
                <span className="pb-stats__label">Реальный фудкост</span>
                <span className="pb-stats__value">{t.revenue > 0 ? fc((real + t.meat) / t.revenue) : '—'}</span>
                <span className="pb-stats__sub">по закупочным {num(real)} ₽ · наценка {fc(markupRate(cc.costed, cc.cost))} · <Link href={`/canteens/markup?month=${month}&c=${canteen.id}`}>проверить</Link></span>
              </div>
            );
          })()}
          <div className="pb-stats__item"><span className="pb-stats__label">Отчётов сдано</span><span className="pb-stats__value">{t.reports}</span></div>
        </div>

        {days.length > 0 && <DayChart days={monthRange(month).days.filter((d) => d <= today).map((d) => {
          const x = t.byDay.get(d);
          return { day: d, revenue: x?.revenue ?? 0, shipped: (x?.shipped ?? 0) + (x?.meat ?? 0), hasRevenue: !!x?.hasRevenue };
        })} />}

        {!canteen.customerIds.length && <div className="notice">Точка не привязана к покупателю в 1С — закупки не видны. {manager ? 'Привяжите в «Доступах».' : 'Скажите руководителю.'}</div>}

        {days.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>За этот месяц пока нет ни отгрузок, ни отчётов.</p>
        ) : (
          <div className="cn-days">
            <div className="cn-day cn-day--head" aria-hidden="true">
              <span>День</span><span className="r">Склад</span><span className="r">Мясо</span><span className="r">Нал</span><span className="r">Безнал</span><span className="r">Выручка</span><span className="r">Фудкост</span>
            </div>
            {days.map((d) => {
              const x = t.byDay.get(d)!;
              const docs = byDay.get(d);
              const row = (
                <>
                  <span>{dayTitle(d)}{d === today && <span className="muted"> · сегодня</span>}{!x.reported && d <= today && <span className="cn-miss" title="Отчёт не сдан"> нет отчёта</span>}</span>
                  <span className="r num">{x.shipped ? num(x.shipped) : '—'}</span>
                  <span className="r num">{x.reported && x.meat ? num(x.meat) : '—'}</span>
                  <span className="r num">{x.hasRevenue ? num(x.cash) : '—'}</span>
                  <span className="r num">{x.hasRevenue ? num(x.card) : '—'}</span>
                  <span className="r num" title={x.source === 'iiko' ? `Из iiko${x.checks ? `, чеков: ${x.checks}` : ''}` : x.source === 'report' ? 'Из отчёта админа' : undefined}>
                    {x.hasRevenue ? num(x.revenue) : '—'}{x.source === 'iiko' && <span className="cn-src">iiko</span>}
                    {reportMismatch(x) != null && <span className="cn-mismatch" title={`В отчёте админа ${num(x.reportCash + x.reportCard)} ₽ (нал ${num(x.reportCash)}, безнал ${num(x.reportCard)})`}>отчёт {reportMismatch(x)! > 0 ? '+' : ''}{num(reportMismatch(x)!)}</span>}
                  </span>
                  <span className="r num">{x.hasRevenue && x.revenue > 0 ? fc((x.shipped + x.meat) / x.revenue) : '—'}</span>
                </>
              );
              if (!docs) return <div key={d} className="cn-day">{row}</div>;
              return (
                <details key={d} className="cn-daybox">
                  <summary className="cn-day">{row}</summary>
                  {[...docs.values()].map((ls) => (
                    <div key={ls[0].onec_doc_ref} className="cn-doc">
                      <div className="cn-doc__head muted">Расходная {ls[0].doc_number ?? ''} · {num(ls.reduce((s, l) => s + Number(l.amount), 0))} ₽</div>
                      <table className="cn-lines">
                        <tbody>
                          {ls.map((l, i) => (
                            <tr key={i}>
                              <td>{l.item_name}</td>
                              <td className="r num">{qtyFmt.format(Number(l.qty))} {l.item_unit}</td>
                              <td className="r num">{rubFine(Number(l.price))}</td>
                              <td className="r num">{num(Number(l.amount))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </details>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

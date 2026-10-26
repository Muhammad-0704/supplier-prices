import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CanteenHeader } from '@/components/canteens/CanteenHeader';
import { MonthNav } from '@/components/canteens/MonthNav';
import { requireCanteens } from '@/lib/access';
import { dayTitle, expectedPrice, isMonth, markupGap, markupIssue, markupRate, mskDay, mskMonth, type MarkupIssue } from '@/lib/canteens';
import { loadCanteens, loadCostLines, type CostLineRow } from '@/lib/canteens-data';
import { num, rubFine } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ISSUE: Record<Exclude<MarkupIssue, 'ok' | 'no_cost'>, { title: string; hint: string }> = {
  below_cost: { title: 'Дешевле закупки', hint: 'Цена в расходной ниже последней закупочной' },
  manual: { title: 'Цена не по установке', hint: 'Цена в расходной не равна «закупка + 10%» и не совпадает с установленной в «Установке цен» — поставили вручную' },
  low: { title: 'Цену не подняли', hint: 'Расходная выписана по установленной цене, но закупка подорожала и цена ниже «закупка + 10%»' },
  high: { title: 'Цену не снизили', hint: 'Расходная выписана по установленной цене, но закупка подешевела и цена выше «закупка + 10%»' },
};
const ORDER: (keyof typeof ISSUE)[] = ['below_cost', 'low', 'manual', 'high'];
const pctFmt = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);

/** Руководитель: наценка склада по точкам и строки, где цена расходной не равна «последняя закупка + 10%». */
export default async function MarkupPage({ searchParams }: { searchParams: { month?: string; c?: string; show?: string } }) {
  const me = await requireCanteens();
  if (me.canteenRole !== 'manager') redirect('/canteens');
  const db = createClient();
  const month = isMonth(searchParams.month) ? searchParams.month : mskMonth();
  const canteens = await loadCanteens(db);
  const only = canteens.find((c) => c.id === searchParams.c)?.id;
  const lines = await loadCostLines(db, month, only);
  const nameOf = new Map(canteens.map((c) => [c.id, c.name]));

  type Row = CostLineRow & { issue: MarkupIssue; gap: number };
  const rows: Row[] = lines.map((l) => ({ ...l, issue: markupIssue(l), gap: markupGap(l) }));

  // Итоги по точкам
  const per = new Map<string, { amount: number; costed: number; cost: number; issues: number; gap: number }>();
  for (const r of rows) {
    const t = per.get(r.canteen_id) ?? { amount: 0, costed: 0, cost: 0, issues: 0, gap: 0 };
    t.amount += r.amount;
    if (r.cost != null) { t.costed += r.amount; t.cost += r.cost * r.qty; }
    if (r.issue !== 'ok' && r.issue !== 'no_cost') t.issues += 1;
    if (r.issue !== 'ok' && r.issue !== 'no_cost') t.gap += r.gap;
    per.set(r.canteen_id, t);
  }
  const all = [...per.values()].reduce((a, t) => ({ amount: a.amount + t.amount, costed: a.costed + t.costed, cost: a.cost + t.cost, issues: a.issues + t.issues, gap: a.gap + t.gap }), { amount: 0, costed: 0, cost: 0, issues: 0, gap: 0 });
  const noCost = rows.filter((r) => r.issue === 'no_cost').length;

  const flagged = rows.filter((r) => r.issue !== 'ok' && r.issue !== 'no_cost');
  const counts = Object.fromEntries(ORDER.map((k) => [k, flagged.filter((r) => r.issue === k).length])) as Record<keyof typeof ISSUE, number>;
  const show = ORDER.includes(searchParams.show as keyof typeof ISSUE) ? (searchParams.show as keyof typeof ISSUE) : ORDER.find((k) => counts[k] > 0) ?? 'below_cost';
  const list = flagged.filter((r) => r.issue === show).sort((a, b) => b.gap - a.gap || Math.abs(b.price - (b.cost ?? 0)) * b.qty - Math.abs(a.price - (a.cost ?? 0)) * a.qty);
  const qs = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const v = { month, c: only, show, ...p };
    Object.entries(v).forEach(([k, x]) => x && q.set(k, x));
    return `/canteens/markup?${q}`;
  };

  return (
    <main className="page">
      <CanteenHeader me={me} current="markup" />

      <section className="card-box">
        <div className="cn-head">
          <h2>Наценка склада</h2>
          <MonthNav month={month} base={only ? `/canteens/markup?c=${only}` : '/canteens/markup'} />
        </div>
        <p className="muted cn-foot">Цена в расходной должна равняться последней закупке + 10%; округление до 1 ₽ или 0,5% цены не считается расхождением. Закупочные цены видит только руководитель.</p>
        <div className="cn-scroll">
          <table className="cn-table">
            <thead>
              <tr>
                <th>Точка</th>
                <th className="r">По расходным</th>
                <th className="r">По закупочным</th>
                <th className="r">Наценка</th>
                <th className="r">Строк с расхождением</th>
                <th className="r" title="Сколько не дополучено до «закупка + 10%» по строкам с заниженной ценой">Недополучено</th>
              </tr>
            </thead>
            <tbody>
              {canteens.filter((c) => !only || c.id === only).map((c) => {
                const t = per.get(c.id) ?? { amount: 0, costed: 0, cost: 0, issues: 0, gap: 0 };
                return (
                  <tr key={c.id}>
                    <td><Link href={qs({ c: only === c.id ? undefined : c.id })}>{c.name}</Link></td>
                    <td className="r num">{num(t.amount)}</td>
                    <td className="r num">{num(t.cost)}</td>
                    <td className="r num">{pctFmt(markupRate(t.costed, t.cost))}</td>
                    <td className="r num">{t.issues}</td>
                    <td className="r num">{t.gap ? num(t.gap) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            {!only && (
              <tfoot>
                <tr>
                  <td>Всего</td>
                  <td className="r num">{num(all.amount)}</td>
                  <td className="r num">{num(all.cost)}</td>
                  <td className="r num">{pctFmt(markupRate(all.costed, all.cost))}</td>
                  <td className="r num">{all.issues}</td>
                  <td className="r num">{all.gap ? num(all.gap) : '—'}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {only && <Link href={qs({ c: undefined })} className="muted" style={{ fontSize: 13 }}>← Все точки</Link>}
        {noCost > 0 && <p className="muted cn-foot">Строк без закупки в прайс-доске: {noCost} — их наценку не проверить (товар не закупался за последние полгода или закуплен под другой карточкой).</p>}
      </section>

      <section className="card-box">
        <div className="cn-head">
          <h2>Расхождения{only ? ` · ${nameOf.get(only)}` : ''}</h2>
        </div>
        <nav className="tabs" aria-label="Вид расхождения">
          {ORDER.map((k) => (
            <Link key={k} href={qs({ show: k })} aria-current={show === k ? 'page' : undefined} title={ISSUE[k].hint}>
              {ISSUE[k].title} <span className="muted">{counts[k]}</span>
            </Link>
          ))}
        </nav>
        <p className="muted cn-foot">{ISSUE[show].hint}.</p>
        {list.length === 0 ? <p className="muted" style={{ margin: 0 }}>Таких строк нет.</p> : (
          <div className="cn-scroll">
            <table className="cn-table cn-table--dense">
              <thead>
                <tr>
                  <th>День</th>
                  {!only && <th>Точка</th>}
                  <th>Товар</th>
                  <th className="r">Кол-во</th>
                  <th className="r">В расходной</th>
                  <th className="r">Установлена</th>
                  <th className="r">Закупка</th>
                  <th className="r">+10%</th>
                  <th className="r">Разница</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 300).map((r) => {
                  const exp = r.cost != null ? expectedPrice(r.cost) : null;
                  return (
                    <tr key={r.shipment_id}>
                      <td title={`Расходная ${r.doc_number ?? ''}`}>{dayTitle(mskDay(r.doc_date))}</td>
                      {!only && <td>{nameOf.get(r.canteen_id)}</td>}
                      <td className="cn-wrap">{r.item_name}</td>
                      <td className="r num">{new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(r.qty)} {r.item_unit}</td>
                      <td className="r num"><b>{rubFine(r.price)}</b></td>
                      <td className="r num">{r.set_price != null ? rubFine(r.set_price) : '—'}</td>
                      <td className="r num" title={r.cost_date ? `от ${dayTitle(mskDay(r.cost_date))}` : undefined}>{r.cost != null ? rubFine(r.cost) : '—'}</td>
                      <td className="r num">{exp != null ? rubFine(exp) : '—'}</td>
                      <td className={`r num ${exp != null && r.price < exp ? 'cn-neg' : 'cn-pos'}`}>{exp != null ? `${r.price - exp > 0 ? '+' : ''}${rubFine(r.price - exp)}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {list.length > 300 && <p className="muted cn-foot">Показаны 300 строк с самой большой разницей из {list.length}.</p>}
          </div>
        )}
      </section>
    </main>
  );
}

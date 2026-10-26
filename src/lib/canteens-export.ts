/** Месячный отчёт «Столовых» для Excel: лист «Итог» по точкам и по листу на каждую точку по дням. */
import { dayTitle, grandTotal, markupRate, monthRange, monthTitle, realCost, type CanteenTotals } from './canteens';

type Cell = { value?: string | number | null; type?: StringConstructor | NumberConstructor; format?: string; fontWeight?: 'bold'; wrap?: boolean } | null;
export interface ExportSheet { sheet: string; data: Cell[][]; columns: { width: number }[]; stickyRowsCount?: number }

export interface CostInfo { cost: number; costed: number; byDay: Map<string, { cost: number; costed: number }> }

const MONEY = '#,##0';
const PCT = '0.0%';
const head = (v: string): Cell => ({ value: v, fontWeight: 'bold', wrap: true });
const text = (v: string, bold = false): Cell => ({ value: v, type: String, ...(bold ? { fontWeight: 'bold' as const } : {}) });
const money = (v: number | null, bold = false): Cell => (v == null ? null : { value: Math.round(v * 100) / 100, type: Number, format: MONEY, ...(bold ? { fontWeight: 'bold' as const } : {}) });
const pct = (v: number | null, bold = false): Cell => (v == null || !Number.isFinite(v) ? null : { value: v, type: Number, format: PCT, ...(bold ? { fontWeight: 'bold' as const } : {}) });

/** Имя листа Excel: до 31 символа, без []:*?/\ и неповторяющееся */
function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Точка';
  let out = base;
  for (let i = 2; used.has(out.toLowerCase()); i++) out = `${base.slice(0, 28)} ${i}`;
  used.add(out.toLowerCase());
  return out;
}

export function buildMonthWorkbook(
  month: string,
  canteens: { id: string; name: string }[],
  totals: Map<string, CanteenTotals>,
  costs: Map<string, CostInfo> | null,
): ExportSheet[] {
  const withCost = !!costs && costs.size > 0;
  const used = new Set<string>(['итог']);

  // ----- Итог -----
  const summaryHead = ['Точка', 'Со склада', 'Мясо', 'Наличные', 'Безнал', 'Выручка', 'Фудкост'];
  if (withCost) summaryHead.push('По закупочным', 'Наценка склада', 'Реальный фудкост');
  summaryHead.push('Отчётов сдано');
  const rows: Cell[][] = [[text(`Столовые · ${monthTitle(month)}`, true)], [], summaryHead.map(head)];
  let allCost = 0, allCosted = 0, allPure = 0;
  for (const c of canteens) {
    const t = totals.get(c.id);
    if (!t) continue;
    const row: Cell[] = [text(c.name), money(t.shipped), money(t.meat), money(t.cash), money(t.card), money(t.revenue), pct(t.foodcost)];
    if (withCost) {
      const ci = costs!.get(c.id);
      const real = ci ? realCost(t.shipped, ci.costed, ci.cost) : null;
      if (ci) { allCost += real!; allCosted += ci.costed; allPure += ci.cost; }
      row.push(money(real), pct(ci ? markupRate(ci.costed, ci.cost) : null), pct(real != null && t.revenue > 0 ? (real + t.meat) / t.revenue : null));
    }
    row.push({ value: t.reports, type: Number });
    rows.push(row);
  }
  const all = grandTotal(canteens.map((c) => totals.get(c.id)).filter((t): t is CanteenTotals => !!t));
  const total: Cell[] = [text('Всего', true), money(all.shipped, true), money(all.meat, true), money(all.cash, true), money(all.card, true), money(all.revenue, true), pct(all.foodcost, true)];
  if (withCost) total.push(money(allCost, true), pct(markupRate(allCosted, allPure), true), pct(all.revenue > 0 ? (allCost + all.meat) / all.revenue : null, true));
  rows.push(total);
  rows.push([], [text('Со склада — по ценам расходных накладных; мясо — из ежедневных отчётов. Фудкост = (склад + мясо) ÷ выручка (наличные + безнал).')]);
  if (withCost) rows.push([text('По закупочным — строки склада по последней закупочной цене до даты отгрузки; реальный фудкост = (по закупочным + мясо) ÷ выручка.')]);

  const sheets: ExportSheet[] = [{
    sheet: 'Итог',
    data: rows,
    columns: [{ width: 22 }, ...summaryHead.slice(1).map(() => ({ width: 15 }))],
    stickyRowsCount: 3,
  }];

  // ----- По точке, по дням -----
  const { days } = monthRange(month);
  for (const c of canteens) {
    const t = totals.get(c.id);
    if (!t) continue;
    const ci = costs?.get(c.id);
    const h = ['День', 'Со склада', 'Мясо', 'Наличные', 'Безнал', 'Выручка', 'Фудкост'];
    if (withCost) h.push('По закупочным', 'Реальный фудкост');
    const data: Cell[][] = [[text(`${c.name} · ${monthTitle(month)}`, true)], [], h.map(head)];
    for (const d of days) {
      const x = t.byDay.get(d);
      const row: Cell[] = [text(dayTitle(d)), money(x?.shipped || null), x?.reported && x.meat ? money(x.meat) : null, x?.reported ? money(x.cash) : null, x?.reported ? money(x.card) : null, x?.reported ? money(x.revenue) : null,
        pct(x?.reported && x.revenue > 0 ? (x.shipped + x.meat) / x.revenue : null)];
      if (withCost) {
        const dc = ci?.byDay.get(d);
        const real = dc && x ? realCost(x.shipped, dc.costed, dc.cost) : null;
        row.push(money(real), pct(real != null && x?.reported && x.revenue > 0 ? (real + x.meat) / x.revenue : null));
      }
      data.push(row);
    }
    const foot: Cell[] = [text('Итого', true), money(t.shipped, true), money(t.meat, true), money(t.cash, true), money(t.card, true), money(t.revenue, true), pct(t.foodcost, true)];
    if (withCost) {
      const real = ci ? realCost(t.shipped, ci.costed, ci.cost) : null;
      foot.push(money(real, true), pct(real != null && t.revenue > 0 ? (real + t.meat) / t.revenue : null, true));
    }
    data.push(foot);
    sheets.push({ sheet: sheetName(c.name, used), data, columns: [{ width: 12 }, ...h.slice(1).map(() => ({ width: 15 }))], stickyRowsCount: 3 });
  }
  return sheets;
}

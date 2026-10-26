/** Месячный отчёт «Центра Питания» для Excel: лист «Итог» по точкам и по листу на каждую точку по дням. */
import { dayTitle, monthRange, monthTitle } from './canteens';
import { totalView, type PointView } from './canteens-view';

type Cell = { value?: string | number | null; type?: StringConstructor | NumberConstructor; format?: string; fontWeight?: 'bold'; wrap?: boolean } | null;
export interface ExportSheet { sheet: string; data: Cell[][]; columns: { width: number }[]; stickyRowsCount?: number }

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

/**
 * points — уже посчитанные точки (buildViews): у руководителя склад по закупочным, у админа — по расходным.
 * Фудкост — за дни с выручкой.
 */
export function buildMonthWorkbook(month: string, points: PointView[], byCost: boolean): ExportSheet[] {
  const used = new Set<string>(['итог']);
  const stockNote = byCost ? 'по закупочным ценам (последняя закупка до даты отгрузки)' : 'по ценам расходных накладных';

  // ----- Итог -----
  const summaryHead = ['Точка', 'Со склада', 'Мясо', 'Наличные', 'Безнал', 'Выручка', 'Фудкост', 'Дней с выручкой', 'Отчётов сдано'];
  const rows: Cell[][] = [[text(`Центр Питания · ${monthTitle(month)}`, true)], [], summaryHead.map(head)];
  for (const p of points) {
    rows.push([text(p.name), money(p.buy), money(p.meat), money(p.cash), money(p.card), money(p.revenue), pct(p.foodcost), { value: p.fcDays, type: Number }, { value: p.reports, type: Number }]);
  }
  const all = totalView(points);
  rows.push([text('Всего', true), money(all.buy, true), money(all.meat, true), money(all.cash, true), money(all.card, true), money(all.revenue, true), pct(all.foodcost, true), null, null]);
  rows.push([], [text(`Со склада — ${stockNote}; мясо — из ежедневных отчётов; выручка — наличные + безнал.`)]);
  rows.push([text('Фудкост — доля выручки, ушедшая на продукты: (склад + мясо) ÷ выручка, только за дни, где выручка известна.')]);

  const sheets: ExportSheet[] = [{
    sheet: 'Итог',
    data: rows,
    columns: [{ width: 22 }, ...summaryHead.slice(1).map(() => ({ width: 15 }))],
    stickyRowsCount: 3,
  }];

  // ----- По точке, по дням -----
  const { days } = monthRange(month);
  for (const p of points) {
    const h = ['День', 'Со склада', 'Мясо', 'Наличные', 'Безнал', 'Выручка', 'Фудкост'];
    const data: Cell[][] = [[text(`${p.name} · ${monthTitle(month)}`, true)], [], h.map(head)];
    for (const d of days) {
      const x = p.byDay.get(d);
      data.push([text(dayTitle(d)), money(x?.buy || null), x?.meat ? money(x.meat) : null, x?.hasRevenue ? money(x.cash) : null, x?.hasRevenue ? money(x.card) : null, x?.hasRevenue ? money(x.revenue) : null,
        pct(x?.hasRevenue && x.revenue > 0 ? (x.buy + x.meat) / x.revenue : null)]);
    }
    data.push([text('Итого', true), money(p.buy, true), money(p.meat, true), money(p.cash, true), money(p.card, true), money(p.revenue, true), pct(p.foodcost, true)]);
    sheets.push({ sheet: sheetName(p.name, used), data, columns: [{ width: 12 }, ...h.slice(1).map(() => ({ width: 15 }))], stickyRowsCount: 3 });
  }
  return sheets;
}

/**
 * OLAP-отчёт iiko по продажам (iikoServer API v2): запрос и разбор ответа. Без сети — проверяется тестами.
 * Имена полей у разных версий iiko чуть отличаются, поэтому берутся из списка колонок сервера.
 */

export interface OlapColumn { name?: string; type?: string; aggregationAllowed?: boolean; groupingAllowed?: boolean; filteringAllowed?: boolean }
export type OlapColumns = Record<string, OlapColumn>;

export interface SalesFields {
  date: string;
  payType: string;
  payGroup: string | null;
  sum: string;
  orders: string | null;
  /** Фильтры, которые есть на этом сервере: исключить удалённые заказы и блюда */
  notDeleted: string[];
}

const pick = (cols: OlapColumns, names: string[], need: 'groupingAllowed' | 'aggregationAllowed'): string | null =>
  names.find((n) => cols[n] && cols[n][need] !== false) ?? null;

/** Выбирает поля отчёта из того, что есть на сервере. null — сервер не умеет нужное. */
export function chooseSalesFields(cols: OlapColumns): SalesFields | null {
  const date = pick(cols, ['OpenDate.Typed', 'OpenDate'], 'groupingAllowed');
  const payType = pick(cols, ['PayTypes', 'PayTypes.Combo'], 'groupingAllowed');
  const sum = pick(cols, ['DishDiscountSumInt', 'DishDiscountSum', 'DishSumInt'], 'aggregationAllowed');
  if (!date || !payType || !sum) return null;
  return {
    date,
    payType,
    payGroup: pick(cols, ['PayTypes.Group'], 'groupingAllowed'),
    sum,
    orders: pick(cols, ['UniqOrderId.OrdersCount', 'UniqOrderId'], 'aggregationAllowed'),
    notDeleted: ['OrderDeleted', 'DeletedWithWriteoff'].filter((f) => cols[f] && cols[f].filteringAllowed !== false),
  };
}

/** Тело запроса: продажи с from по to (to не включая), сгруппированные по дню и типу оплаты. */
export function salesRequest(f: SalesFields, from: string, to: string, byPayType = true): Record<string, unknown> {
  const filters: Record<string, unknown> = {
    [f.date]: { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: false },
  };
  for (const name of f.notDeleted) filters[name] = { filterType: 'IncludeValues', values: ['NOT_DELETED'] };
  return {
    reportType: 'SALES',
    buildSummary: false,
    groupByRowFields: byPayType ? [f.date, f.payType, ...(f.payGroup ? [f.payGroup] : [])] : [f.date],
    groupByColFields: [],
    aggregateFields: byPayType || !f.orders ? [f.sum] : [f.sum, f.orders],
    filters,
  };
}

export interface DayRevenue { day: string; cash: number; card: number; total: number; checks: number; byPayType: Record<string, number> }

const num = (v: unknown) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')) || 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** День из ответа iiko: «2026-10-26», «2026-10-26T00:00:00» или «26.10.2026» */
export function olapDay(v: unknown): string | null {
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/** Наличные: группа оплат CASH, а если группы нет — по названию («Наличные», но не «Безналичный расчёт»). */
export function isCash(payType: string, group?: string | null): boolean {
  if (group) return group.toUpperCase() === 'CASH';
  return /нал/i.test(payType) && !/безнал/i.test(payType);
}

/** Строки «день × тип оплаты» → выручка по дням; checks — из второго отчёта (по дням без типов оплат). */
export function parseSales(f: SalesFields, rows: Record<string, unknown>[], checkRows: Record<string, unknown>[] = []): DayRevenue[] {
  const days = new Map<string, DayRevenue>();
  const get = (d: string) => {
    let x = days.get(d);
    if (!x) { x = { day: d, cash: 0, card: 0, total: 0, checks: 0, byPayType: {} }; days.set(d, x); }
    return x;
  };
  for (const r of rows) {
    const d = olapDay(r[f.date]);
    if (!d) continue;
    const sum = num(r[f.sum]);
    if (!sum) continue;
    const type = String(r[f.payType] ?? '').trim() || 'Без типа оплаты';
    const x = get(d);
    x.total += sum;
    x.byPayType[type] = r2((x.byPayType[type] ?? 0) + sum);
    if (isCash(type, f.payGroup ? String(r[f.payGroup] ?? '') : null)) x.cash += sum;
    else x.card += sum;
  }
  if (f.orders) {
    for (const r of checkRows) {
      const d = olapDay(r[f.date]);
      if (d) get(d).checks += num(r[f.orders]);
    }
  }
  return [...days.values()].map((x) => ({ ...x, cash: r2(x.cash), card: r2(x.card), total: r2(x.total), checks: Math.round(x.checks) })).sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Подробные продажи из OLAP iiko: часы, блюда, кассиры, удаления, возвраты. Без сети — проверяется тестами.
 * Поля берутся из списка колонок сервера; если чего-то нет, этот срез просто пропускается.
 */
import { olapDay, type OlapColumns, type SalesFields } from './olap';

export interface DetailFields {
  hour: string | null;
  dish: string | null;
  category: string | null;
  amount: string | null;
  discount: string | null;
  fullSum: string | null;
  cashier: string | null;
  /** Удалено из заказа: значения NOT_DELETED / DELETED_WITH_WRITEOFF / DELETED_WITHOUT_WRITEOFF */
  deleted: string | null;
  storned: string | null;
}

const pick = (cols: OlapColumns, names: string[], need: 'groupingAllowed' | 'aggregationAllowed' | 'filteringAllowed'): string | null =>
  names.find((n) => cols[n] && cols[n][need] !== false) ?? null;

export function chooseDetailFields(cols: OlapColumns): DetailFields {
  return {
    hour: pick(cols, ['HourClose', 'HourOpen'], 'groupingAllowed'),
    dish: pick(cols, ['DishName', 'DishFullName'], 'groupingAllowed'),
    category: pick(cols, ['DishCategory', 'DishGroup', 'DishGroup.TopParent'], 'groupingAllowed'),
    amount: pick(cols, ['DishAmountInt', 'DishAmount'], 'aggregationAllowed'),
    discount: pick(cols, ['DiscountSum', 'DishDiscountSum.Discount'], 'aggregationAllowed'),
    fullSum: pick(cols, ['DishSumInt', 'DishSum'], 'aggregationAllowed'),
    cashier: pick(cols, ['Cashier', 'OrderWaiter.Name', 'AuthUser'], 'groupingAllowed'),
    deleted: pick(cols, ['DeletedWithWriteoff'], 'groupingAllowed'),
    storned: pick(cols, ['Storned'], 'groupingAllowed'),
  };
}

type Body = Record<string, unknown>;
const range = (f: SalesFields, from: string, to: string) => ({ [f.date]: { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: false } });
const notDeleted = (f: SalesFields) => Object.fromEntries(f.notDeleted.map((n) => [n, { filterType: 'IncludeValues', values: ['NOT_DELETED'] }]));
const body = (group: string[], agg: (string | null)[], filters: Body): Body => ({
  reportType: 'SALES', buildSummary: false, groupByRowFields: group, groupByColFields: [], aggregateFields: agg.filter(Boolean), filters,
});

export type DetailKind = 'hours' | 'dishes' | 'staff' | 'deleted' | 'returns';

/** Запросы, которые этот сервер умеет. Ключ — срез, значение — тело OLAP-запроса. */
export function detailRequests(f: SalesFields, d: DetailFields, from: string, to: string): Partial<Record<DetailKind, Body>> {
  const out: Partial<Record<DetailKind, Body>> = {};
  const live = { ...range(f, from, to), ...notDeleted(f) };
  const noReturns = d.storned ? { [d.storned]: { filterType: 'IncludeValues', values: ['FALSE'] } } : {};
  if (d.hour) out.hours = body([f.date, d.hour], [f.sum, f.orders], live);
  if (d.dish) out.dishes = body([f.date, d.dish, ...(d.category ? [d.category] : [])], [f.sum, d.amount, d.discount], { ...live, ...noReturns });
  if (d.cashier) out.staff = body([f.date, d.cashier], [f.sum, f.orders, d.discount], live);
  if (d.deleted && d.dish) {
    const del: Body = { ...range(f, from, to), [d.deleted]: { filterType: 'IncludeValues', values: ['DELETED_WITH_WRITEOFF', 'DELETED_WITHOUT_WRITEOFF'] } };
    out.deleted = body([f.date, d.deleted, d.dish, ...(d.cashier ? [d.cashier] : [])], [d.amount, d.fullSum ?? f.sum], del);
  }
  if (d.storned && d.dish) {
    out.returns = body([f.date, d.dish, ...(d.cashier ? [d.cashier] : [])], [d.amount, f.sum], { ...live, [d.storned]: { filterType: 'IncludeValues', values: ['TRUE'] } });
  }
  return out;
}

export interface HourRow { day: string; hour: number; revenue: number; checks: number }
export interface DishRow { day: string; dish: string; category: string; qty: number; revenue: number; discount: number }
export interface StaffRow { day: string; cashier: string; revenue: number; checks: number; discount: number }
export interface VoidRow { day: string; kind: 'deleted' | 'return'; cashier: string; dish: string; qty: number; amount: number; writeoff: boolean | null }

const num = (v: unknown) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')) || 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const str = (v: unknown, empty: string) => String(v ?? '').trim() || empty;

/** Строки одного ключа складываются: iiko может вернуть один день дважды (разные кассы, разные смены). */
function merge<T>(rows: T[], key: (r: T) => string, add: (a: T, b: T) => void): T[] {
  const m = new Map<string, T>();
  for (const r of rows) {
    const k = key(r);
    const x = m.get(k);
    if (x) add(x, r); else m.set(k, { ...r });
  }
  return [...m.values()];
}

export function parseHours(f: SalesFields, d: DetailFields, rows: Body[]): HourRow[] {
  const out: HourRow[] = [];
  for (const r of rows) {
    const day = olapDay(r[f.date]);
    const hour = Number.parseInt(String(r[d.hour!] ?? ''), 10);
    if (!day || !Number.isFinite(hour) || hour < 0 || hour > 23) continue;
    out.push({ day, hour, revenue: num(r[f.sum]), checks: f.orders ? Math.round(num(r[f.orders])) : 0 });
  }
  return merge(out, (x) => `${x.day}|${x.hour}`, (a, b) => { a.revenue += b.revenue; a.checks += b.checks; })
    .map((x) => ({ ...x, revenue: r2(x.revenue) }));
}

export function parseDishes(f: SalesFields, d: DetailFields, rows: Body[]): DishRow[] {
  const out: DishRow[] = [];
  for (const r of rows) {
    const day = olapDay(r[f.date]);
    if (!day) continue;
    const qty = d.amount ? num(r[d.amount]) : 0;
    const revenue = num(r[f.sum]);
    if (!qty && !revenue) continue;
    out.push({ day, dish: str(r[d.dish!], 'Без названия'), category: d.category ? str(r[d.category], 'Без категории') : 'Без категории', qty, revenue, discount: d.discount ? num(r[d.discount]) : 0 });
  }
  return merge(out, (x) => `${x.day}|${x.dish}`, (a, b) => { a.qty += b.qty; a.revenue += b.revenue; a.discount += b.discount; })
    .map((x) => ({ ...x, qty: r3(x.qty), revenue: r2(x.revenue), discount: r2(x.discount) }));
}

export function parseStaff(f: SalesFields, d: DetailFields, rows: Body[]): StaffRow[] {
  const out: StaffRow[] = [];
  for (const r of rows) {
    const day = olapDay(r[f.date]);
    if (!day) continue;
    out.push({ day, cashier: str(r[d.cashier!], 'Не указан'), revenue: num(r[f.sum]), checks: f.orders ? Math.round(num(r[f.orders])) : 0, discount: d.discount ? num(r[d.discount]) : 0 });
  }
  return merge(out, (x) => `${x.day}|${x.cashier}`, (a, b) => { a.revenue += b.revenue; a.checks += b.checks; a.discount += b.discount; })
    .map((x) => ({ ...x, revenue: r2(x.revenue), discount: r2(x.discount) }));
}

export function parseVoids(f: SalesFields, d: DetailFields, deleted: Body[], returns: Body[]): VoidRow[] {
  const out: VoidRow[] = [];
  const sumOf = (r: Body, fields: (string | null)[]) => { for (const x of fields) if (x && r[x] != null) return Math.abs(num(r[x])); return 0; };
  for (const r of deleted) {
    const day = olapDay(r[f.date]);
    if (!day) continue;
    const flag = String(r[d.deleted!] ?? '');
    if (flag === 'NOT_DELETED') continue;
    out.push({ day, kind: 'deleted', cashier: d.cashier ? str(r[d.cashier], 'Не указан') : 'Не указан', dish: str(r[d.dish!], 'Без названия'),
      qty: Math.abs(d.amount ? num(r[d.amount]) : 0), amount: r2(sumOf(r, [d.fullSum, f.sum])), writeoff: flag === 'DELETED_WITH_WRITEOFF' ? true : flag ? false : null });
  }
  for (const r of returns) {
    const day = olapDay(r[f.date]);
    if (!day) continue;
    out.push({ day, kind: 'return', cashier: d.cashier ? str(r[d.cashier], 'Не указан') : 'Не указан', dish: str(r[d.dish!], 'Без названия'),
      qty: Math.abs(d.amount ? num(r[d.amount]) : 0), amount: r2(sumOf(r, [f.sum])), writeoff: null });
  }
  return out.filter((v) => v.qty || v.amount);
}

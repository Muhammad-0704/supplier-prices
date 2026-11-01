import 'server-only';
import { randomBytes, randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildViews, type PointView } from './canteens-view';
import { customerMap, loadCanteens, loadIiko, loadReports, loadShipments } from './canteens-data';
import { mskDay, mskMonth, summarize } from './canteens';
import {
  byHour, byWeekday, cashiers, menu, voids,
  type DishIn, type HourIn, type RevDay, type StaffIn, type VoidIn,
} from './iiko-insights';

export interface TvLink {
  id: string;
  token: string;
  name: string;
  active: boolean;
  created_at: string;
  last_opened_at: string | null;
  open_count: number;
}

/** Случайный токен ссылки: 24 байта, ~32 символа, подобрать невозможно. */
export function newTvToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Код для короткого входа на ТВ: 6 цифр, действует 10 минут, одноразовый */
export const PAIR_TTL_MS = 10 * 60_000;
export function newPairCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
/** Цифры из того, что набрали пультом: пробелы, дефисы и прочее отбрасываются */
export function cleanPairCode(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  return d.length === 6 ? d : null;
}
/** Защита от перебора: не больше 10 неудачных попыток с адреса и 100 всего за 10 минут */
export const PAIR_LIMIT_IP = 10;
export const PAIR_LIMIT_ALL = 100;
export function pairBlocked(failedFromIp: number, failedAll: number): boolean {
  return failedFromIp >= PAIR_LIMIT_IP || failedAll >= PAIR_LIMIT_ALL;
}

/** Действующая ссылка по токену или null. Токен проверяется по формату до запроса в базу. */
export async function findActiveTvLink(db: SupabaseClient, token: string): Promise<TvLink | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data } = await db.from('tv_links').select('*').eq('token', token).maybeSingle();
  if (!data?.active) return null;
  return data as TvLink;
}

function groupBy<T extends { canteen_id: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(r.canteen_id, [...(out.get(r.canteen_id) ?? []), r]);
  return out;
}

/**
 * Данные для ТВ: только сегодня, только по активным точкам, склад — по ценам расходных
 * (как у админа точки), закупочные цены склада на ТВ не выводятся ни при каких правах.
 * Часы и блюда — из iiko за сегодня; если iiko не подключён или пуст, экраны «По часам»/«Блюда» это покажут.
 */
export async function loadTvToday(db: SupabaseClient): Promise<{ day: string; points: PointView[]; hours: Map<string, HourIn[]>; dishes: Map<string, DishIn[]> }> {
  const day = mskDay(Date.now());
  const canteens = await loadCanteens(db);
  const ids = canteens.flatMap((c) => c.customerIds);
  const canteenIds = canteens.map((c) => c.id);
  const dayStart = new Date(`${day}T00:00:00+03:00`).toISOString();
  const dayEnd = new Date(Date.parse(dayStart) + 86_400_000).toISOString();

  const [{ data: shipments }, { data: reports }, { data: iiko }, { data: hourRows }, { data: dishRows }] = await Promise.all([
    ids.length
      ? db.from('shipments').select('customer_id, doc_date, amount').in('customer_id', ids).gte('doc_date', dayStart).lt('doc_date', dayEnd)
      : Promise.resolve({ data: [] }),
    canteenIds.length
      ? db.from('daily_reports').select('canteen_id, report_date, cash, card, meat').in('canteen_id', canteenIds).eq('report_date', day)
      : Promise.resolve({ data: [] }),
    canteenIds.length
      ? db.from('iiko_revenue').select('canteen_id, day, cash, card, total, checks').in('canteen_id', canteenIds).eq('day', day)
      : Promise.resolve({ data: [] }),
    canteenIds.length
      ? db.from('iiko_hours').select('canteen_id, day, hour, revenue, checks').in('canteen_id', canteenIds).eq('day', day)
      : Promise.resolve({ data: [] }),
    canteenIds.length
      ? db.from('iiko_dishes').select('canteen_id, day, dish, category, qty, revenue, discount').in('canteen_id', canteenIds).eq('day', day)
      : Promise.resolve({ data: [] }),
  ]);

  const totals = summarize(
    canteenIds,
    customerMap(canteens),
    (shipments ?? []).map((s) => ({ customer_id: s.customer_id, doc_date: s.doc_date, amount: Number(s.amount) || 0 })),
    (reports ?? []).map((r) => ({ canteen_id: r.canteen_id, report_date: r.report_date, cash: Number(r.cash) || 0, card: Number(r.card) || 0, meat: Number(r.meat) || 0 })),
    (iiko ?? []).map((i) => ({ canteen_id: i.canteen_id, day: i.day, cash: Number(i.cash) || 0, card: Number(i.card) || 0, total: Number(i.total) || 0, checks: Number(i.checks) || 0 })),
  );
  // costs=null -> по ценам расходных, а не по закупочным
  const points = buildViews(canteens, totals, null);

  const hours = groupBy((hourRows ?? []).map((h) => ({ canteen_id: h.canteen_id, day: h.day, hour: Number(h.hour), revenue: Number(h.revenue) || 0, checks: Number(h.checks) || 0 })));
  const dishes = groupBy((dishRows ?? []).map((d) => ({ canteen_id: d.canteen_id, day: d.day, dish: d.dish, category: d.category, qty: Number(d.qty) || 0, revenue: Number(d.revenue) || 0, discount: Number(d.discount) || 0 })));
  return { day, points, hours, dishes };
}

/**
 * Данные за месяц (с начала текущего месяца по сегодня): итог по точке, дни недели,
 * кассиры и удаления/возвраты. Кассиры и удаления — из таблиц, открытых в RLS только
 * руководителю; ТВ их всё равно показывает (решение владельца) — это экран без входа,
 * его отдельно отзывают в «Доступах», когда он не нужен.
 */
export async function loadTvMonth(db: SupabaseClient): Promise<{
  points: PointView[]; weekday: Map<string, RevDay[]>; staff: Map<string, StaffIn[]>; voidRows: Map<string, VoidIn[]>;
}> {
  const month = mskMonth();
  const canteens = await loadCanteens(db);
  const canteenIds = canteens.map((c) => c.id);
  const since = `${month}-01`;

  const [shipments, reports, iiko, { data: staffRows }, { data: voidData }] = await Promise.all([
    loadShipments(db, canteens, month),
    loadReports(db, canteens, month),
    loadIiko(db, canteens, month),
    canteenIds.length
      ? db.from('iiko_staff').select('canteen_id, day, cashier, revenue, checks, discount').in('canteen_id', canteenIds).gte('day', since)
      : Promise.resolve({ data: [] }),
    canteenIds.length
      ? db.from('iiko_voids').select('canteen_id, day, kind, cashier, dish, qty, amount, writeoff').in('canteen_id', canteenIds).gte('day', since)
      : Promise.resolve({ data: [] }),
  ]);

  const totals = summarize(canteenIds, customerMap(canteens), shipments, reports, iiko);
  // costs=null -> по ценам расходных, а не по закупочным — как и в loadTvToday
  const points = buildViews(canteens, totals, null);

  const weekday = groupBy(iiko.map((i) => ({ canteen_id: i.canteen_id, day: i.day, total: i.total, checks: i.checks ?? 0 })));
  const staff = groupBy((staffRows ?? []).map((s) => ({ canteen_id: s.canteen_id, day: s.day, cashier: s.cashier, revenue: Number(s.revenue) || 0, checks: Number(s.checks) || 0, discount: Number(s.discount) || 0 })));
  const voidRows = groupBy((voidData ?? []).map((v) => ({ canteen_id: v.canteen_id, day: v.day, kind: v.kind, cashier: v.cashier, dish: v.dish, qty: Number(v.qty) || 0, amount: Number(v.amount) || 0, writeoff: v.writeoff })));
  return { points, weekday, staff, voidRows };
}

export interface TvHour { hour: number; revenue: number }
export interface TvDish { dish: string; qty: number; revenue: number }
export interface TvWeekday { label: string; revenue: number | null; checks: number | null }
export interface TvCashier { cashier: string; revenue: number; checks: number; voidRate: number | null }
export interface TvVoids { deletedCount: number; deletedAmount: number; returnsCount: number; returnsAmount: number }

export interface TvPointData {
  id: string; name: string;
  revenue: number; foodcost: number | null; buy: number; meat: number;
  cash: number; card: number; checks: number;
  /** Сдал ли админ точки отчёт за сегодня */
  reported: boolean;
  /** Расхождение отчёта с кассой iiko, если оно заметно (>1% или 100 ₽); null — расхождения нет или сверять не с чем */
  mismatch: number | null;
  /** Выручка по часам сегодня, из iiko; пусто — iiko не подключён или данных ещё нет */
  hours: TvHour[];
  peakHour: TvHour | null;
  /** Топ-5 блюд по выручке сегодня, из iiko */
  topDishes: TvDish[];
  /** С начала месяца по сегодня */
  month: { revenue: number; foodcost: number | null; buy: number; meat: number };
  weekdays: TvWeekday[];
  /** Топ-5 кассиров по выручке за месяц */
  topCashiers: TvCashier[];
  voidsTotal: TvVoids;
}

/** Сериализуемые поля для ответа API: PointView.byDay — Map, в JSON не едет. */
export function tvPointsData(
  day: string, points: PointView[], hours: Map<string, HourIn[]>, dishes: Map<string, DishIn[]>,
  month: { points: PointView[]; weekday: Map<string, RevDay[]>; staff: Map<string, StaffIn[]>; voidRows: Map<string, VoidIn[]> },
): TvPointData[] {
  const monthByPoint = new Map(month.points.map((p) => [p.id, p]));
  return points.map((p) => {
    const d = p.byDay.get(day);
    const { hours: hourStats, peak } = byHour(hours.get(p.id) ?? []);
    const { top } = menu(dishes.get(p.id) ?? [], 5, 0);
    const m = monthByPoint.get(p.id);
    const weekdayStats = byWeekday(month.weekday.get(p.id) ?? []);
    const cashierStats = cashiers(month.staff.get(p.id) ?? [], month.voidRows.get(p.id) ?? []);
    const v = voids(month.voidRows.get(p.id) ?? []);
    return {
      id: p.id, name: p.name, revenue: p.revenue, foodcost: p.foodcost, buy: p.buy, meat: p.meat,
      cash: p.cash, card: p.card, checks: d?.checks ?? 0, reported: d?.reported ?? false, mismatch: d?.mismatch ?? null,
      hours: hourStats.map((h) => ({ hour: h.hour, revenue: h.revenue })),
      peakHour: peak ? { hour: peak.hour, revenue: peak.revenue } : null,
      topDishes: top.map((t) => ({ dish: t.dish, qty: t.qty, revenue: t.revenue })),
      month: { revenue: m?.revenue ?? 0, foodcost: m?.foodcost ?? null, buy: m?.buy ?? 0, meat: m?.meat ?? 0 },
      weekdays: weekdayStats.map((w) => ({ label: w.label, revenue: w.revenue, checks: w.checks })),
      topCashiers: cashierStats.slice(0, 5).map((c) => ({ cashier: c.cashier, revenue: c.revenue, checks: c.checks, voidRate: c.voidRate })),
      voidsTotal: { deletedCount: v.deleted.count, deletedAmount: v.deleted.amount, returnsCount: v.returns.count, returnsAmount: v.returns.amount },
    };
  });
}

import 'server-only';
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildViews, type PointView } from './canteens-view';
import { customerMap, loadCanteens } from './canteens-data';
import { mskDay, summarize } from './canteens';
import { byHour, menu, type DishIn, type HourIn } from './iiko-insights';

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

export interface TvHour { hour: number; revenue: number }
export interface TvDish { dish: string; qty: number; revenue: number }

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
}

/** Сериализуемые поля для ответа API: PointView.byDay — Map, в JSON не едет. */
export function tvPointsData(day: string, points: PointView[], hours: Map<string, HourIn[]>, dishes: Map<string, DishIn[]>): TvPointData[] {
  return points.map((p) => {
    const d = p.byDay.get(day);
    const { hours: hourStats, peak } = byHour(hours.get(p.id) ?? []);
    const { top } = menu(dishes.get(p.id) ?? [], 5, 0);
    return {
      id: p.id, name: p.name, revenue: p.revenue, foodcost: p.foodcost, buy: p.buy, meat: p.meat,
      cash: p.cash, card: p.card, checks: d?.checks ?? 0, reported: d?.reported ?? false, mismatch: d?.mismatch ?? null,
      hours: hourStats.map((h) => ({ hour: h.hour, revenue: h.revenue })),
      peakHour: peak ? { hour: peak.hour, revenue: peak.revenue } : null,
      topDishes: top.map((t) => ({ dish: t.dish, qty: t.qty, revenue: t.revenue })),
    };
  });
}

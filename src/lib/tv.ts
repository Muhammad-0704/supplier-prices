import 'server-only';
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildViews, type PointView } from './canteens-view';
import { customerMap, loadCanteens } from './canteens-data';
import { mskDay, summarize } from './canteens';

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

/**
 * Цифры для ТВ: только сегодня, только по активным точкам, склад — по ценам расходных
 * (как у админа точки), закупочные цены склада на ТВ не выводятся ни при каких правах.
 */
export async function loadTvToday(db: SupabaseClient): Promise<{ day: string; points: PointView[] }> {
  const day = mskDay(Date.now());
  const canteens = await loadCanteens(db);
  const ids = canteens.flatMap((c) => c.customerIds);
  const canteenIds = canteens.map((c) => c.id);
  const dayStart = new Date(`${day}T00:00:00+03:00`).toISOString();
  const dayEnd = new Date(Date.parse(dayStart) + 86_400_000).toISOString();

  const [{ data: shipments }, { data: reports }, { data: iiko }] = await Promise.all([
    ids.length
      ? db.from('shipments').select('customer_id, doc_date, amount').in('customer_id', ids).gte('doc_date', dayStart).lt('doc_date', dayEnd)
      : Promise.resolve({ data: [] }),
    canteenIds.length
      ? db.from('daily_reports').select('canteen_id, report_date, cash, card, meat').in('canteen_id', canteenIds).eq('report_date', day)
      : Promise.resolve({ data: [] }),
    canteenIds.length
      ? db.from('iiko_revenue').select('canteen_id, day, cash, card, total, checks').in('canteen_id', canteenIds).eq('day', day)
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
  return { day, points };
}

export interface TvPointData {
  id: string; name: string;
  revenue: number; foodcost: number | null; buy: number; meat: number;
  cash: number; card: number;
  /** Сдал ли админ точки отчёт за сегодня */
  reported: boolean;
  /** Расхождение отчёта с кассой iiko, если оно заметно (>1% или 100 ₽); null — расхождения нет или сверять не с чем */
  mismatch: number | null;
}

/** Только сериализуемые поля для ответа API — PointView.byDay — Map, в JSON не едет. */
export function tvPointsData(day: string, points: PointView[]): TvPointData[] {
  return points.map((p) => {
    const d = p.byDay.get(day);
    return {
      id: p.id, name: p.name, revenue: p.revenue, foodcost: p.foodcost, buy: p.buy, meat: p.meat,
      cash: p.cash, card: p.card, reported: d?.reported ?? false, mismatch: d?.mismatch ?? null,
    };
  });
}

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { monthRange, type ReportRow } from './canteens';

export interface Canteen { id: string; name: string; customerIds: string[] }

export interface ShipmentLineRow {
  onec_doc_ref: string;
  doc_number: string | null;
  doc_date: string;
  customer_id: string;
  item_name: string;
  item_unit: string;
  qty: number;
  price: number;
  amount: number;
}

/** Точки, которые видит вошедший (права в базе), с привязанными покупателями 1С. */
export async function loadCanteens(db: SupabaseClient): Promise<Canteen[]> {
  const [{ data: cs, error }, { data: links }] = await Promise.all([
    db.from('canteens').select('id, name').eq('active', true).order('sort').order('name'),
    db.from('canteen_customers').select('customer_id, canteen_id'),
  ]);
  if (error) throw new Error(`Точки: ${error.message}`);
  return (cs ?? []).map((c) => ({ ...c, customerIds: (links ?? []).filter((l) => l.canteen_id === c.id).map((l) => l.customer_id) }));
}

export function customerMap(canteens: Canteen[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of canteens) for (const id of c.customerIds) m.set(id, c.id);
  return m;
}

async function pages<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Строки расходных за месяц по выбранным точкам. */
export async function loadShipments(db: SupabaseClient, canteens: Canteen[], month: string, full = false): Promise<ShipmentLineRow[]> {
  const ids = canteens.flatMap((c) => c.customerIds);
  if (!ids.length) return [];
  const { from, to } = monthRange(month);
  const cols = full ? 'id, onec_doc_ref, doc_number, doc_date, customer_id, item_name, item_unit, qty, price, amount' : 'id, customer_id, doc_date, amount';
  return pages<ShipmentLineRow>((a, b) => db.from('shipments').select(cols).in('customer_id', ids).gte('doc_date', from).lt('doc_date', to)
    .order('doc_date').order('id').range(a, b) as unknown as PromiseLike<{ data: ShipmentLineRow[] | null; error: { message: string } | null }>);
}

export async function loadReports(db: SupabaseClient, canteens: Canteen[], month: string): Promise<ReportRow[]> {
  if (!canteens.length) return [];
  const { days } = monthRange(month);
  const { data, error } = await db.from('daily_reports').select('canteen_id, report_date, cash, card, meat')
    .in('canteen_id', canteens.map((c) => c.id)).gte('report_date', days[0]).lte('report_date', days[days.length - 1]);
  if (error) throw new Error(`Отчёты: ${error.message}`);
  return (data ?? []).map((r) => ({ ...r, cash: Number(r.cash), card: Number(r.card), meat: Number(r.meat ?? 0) }));
}

export async function loadSyncState(db: SupabaseClient): Promise<{ at: string; ok: boolean; message: string | null } | null> {
  const { data } = await db.from('sync_state').select('at, ok, message').eq('key', 'shipments').maybeSingle();
  return data ?? null;
}

// ---------- Себестоимость (только руководитель столовых; остальным база вернёт пусто) ----------

export interface CostSummaryRow { canteen_id: string; day: string; amount: number; cost_amount: number | null; costed_amount: number | null; lines: number; lines_no_cost: number }

export interface CostLineRow {
  shipment_id: number; canteen_id: string; onec_doc_ref: string; doc_number: string | null; doc_date: string;
  item_id: string | null; item_name: string; item_unit: string; qty: number; price: number; amount: number;
  cost: number | null; cost_date: string | null; set_price: number | null; set_at: string | null;
}

const numOrNull = (v: unknown) => (v == null ? null : Number(v));

export async function loadCostSummary(db: SupabaseClient, month: string): Promise<CostSummaryRow[]> {
  const { from, to } = monthRange(month);
  const rows = await pages<CostSummaryRow>((a, b) => db.rpc('canteen_cost_summary', { p_from: from, p_to: to }).range(a, b) as unknown as PromiseLike<{ data: CostSummaryRow[] | null; error: { message: string } | null }>);
  return rows.map((r) => ({ ...r, amount: Number(r.amount), cost_amount: numOrNull(r.cost_amount), costed_amount: numOrNull(r.costed_amount) }));
}

export async function loadCostLines(db: SupabaseClient, month: string, canteenId?: string): Promise<CostLineRow[]> {
  const { from, to } = monthRange(month);
  const rows = await pages<CostLineRow>((a, b) => db.rpc('canteen_cost_lines', { p_from: from, p_to: to, p_canteen: canteenId ?? null }).range(a, b) as unknown as PromiseLike<{ data: CostLineRow[] | null; error: { message: string } | null }>);
  return rows.map((r) => ({ ...r, qty: Number(r.qty), price: Number(r.price), amount: Number(r.amount), cost: numOrNull(r.cost), set_price: numOrNull(r.set_price) }));
}

/** Итоги себестоимости по точке: по расходным, по закупочным (где закупка известна) */
export function costTotals(rows: CostSummaryRow[]): Map<string, { amount: number; cost: number; costed: number; noCost: number; byDay: Map<string, { cost: number; costed: number }> }> {
  const out = new Map<string, { amount: number; cost: number; costed: number; noCost: number; byDay: Map<string, { cost: number; costed: number }> }>();
  for (const r of rows) {
    const t = out.get(r.canteen_id) ?? { amount: 0, cost: 0, costed: 0, noCost: 0, byDay: new Map() };
    t.amount += r.amount;
    t.cost += r.cost_amount ?? 0;
    t.costed += r.costed_amount ?? 0;
    t.noCost += r.lines_no_cost;
    t.byDay.set(r.day, { cost: r.cost_amount ?? 0, costed: r.costed_amount ?? 0 });
    out.set(r.canteen_id, t);
  }
  return out;
}

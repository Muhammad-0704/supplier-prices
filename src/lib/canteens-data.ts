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
  const { data, error } = await db.from('daily_reports').select('canteen_id, report_date, cash, card')
    .in('canteen_id', canteens.map((c) => c.id)).gte('report_date', days[0]).lte('report_date', days[days.length - 1]);
  if (error) throw new Error(`Отчёты: ${error.message}`);
  return (data ?? []).map((r) => ({ ...r, cash: Number(r.cash), card: Number(r.card) }));
}

export async function loadSyncState(db: SupabaseClient): Promise<{ at: string; ok: boolean; message: string | null } | null> {
  const { data } = await db.from('sync_state').select('at, ok, message').eq('key', 'shipments').maybeSingle();
  return data ?? null;
}

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveItem } from './derive';
import { suggest, type PurchaseEvent, type ReorderMark, type StockCount, type Suggestion } from './reorder';

const DAY = 86_400_000;
export const RHYTHM_WINDOW_DAYS = 180;

export interface OrderRow {
  itemId: string;
  name: string;
  unit: string;
  category: string;
  s: Suggestion;
  /** Где дешевле всего сейчас */
  bestSupplierId: string;
  bestPrice: number;
  /** У кого брали последний раз */
  currentSupplierId: string;
  currentPrice: number;
}

export interface OrderData {
  rows: OrderRow[];
  suppliers: Record<string, string>;
}

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Все товары с ритмом закупок: статус, оценка остатка, сколько заказать и у кого дешевле. */
export async function loadOrder(db: SupabaseClient, now = Date.now()): Promise<OrderData> {
  const since = new Date(now - RHYTHM_WINDOW_DAYS * DAY).toISOString();
  type ItemR = { id: string; name: string; unit: string; category: string; merged_into: string | null };
  type PurR = { item_id: string; doc_date: string; qty: number; operation: string | null };
  type OfferR = { item_id: string; supplier_id: string; last_price: number; prev_price: number | null; last_date: string };
  const [items, purchases, offers, hidden, counts, marks, suppliers] = await Promise.all([
    all<ItemR>((f, t) => db.from('items').select('id, name, unit, category, merged_into').range(f, t)),
    all<PurR>((f, t) => db.from('purchases').select('item_id, doc_date, qty, operation')
      .or('operation.is.null,operation.eq.ПоступлениеОтПоставщика').gte('doc_date', since).order('id').range(f, t)),
    all<OfferR>((f, t) => db.from('offer_prices').select('item_id, supplier_id, last_price, prev_price, last_date').range(f, t)),
    all<{ item_id: string }>((f, t) => db.from('item_flags').select('item_id').eq('hidden', true).range(f, t)),
    all<{ item_id: string; qty: number; counted_at: string }>((f, t) => db.from('stock_counts').select('item_id, qty, counted_at')
      .gte('counted_at', new Date(now - 60 * DAY).toISOString()).order('counted_at', { ascending: false }).range(f, t)),
    all<{ item_id: string; status: 'ordered' | 'snoozed'; until: string | null; marked_at: string }>((f, t) => db.from('reorder_marks').select('item_id, status, until, marked_at').range(f, t)),
    all<{ id: string; name: string }>((f, t) => db.from('suppliers').select('id, name').range(f, t)),
  ]);

  const canon = new Map(items.map((i) => [i.id, i.merged_into ?? i.id]));
  const events = new Map<string, PurchaseEvent[]>();
  for (const p of purchases) {
    const id = canon.get(p.item_id) ?? p.item_id;
    const list = events.get(id) ?? [];
    list.push({ date: p.doc_date, qty: Number(p.qty) });
    events.set(id, list);
  }
  const lastCount = new Map<string, StockCount>();
  for (const c of counts) if (!lastCount.has(c.item_id)) lastCount.set(c.item_id, { qty: Number(c.qty), at: c.counted_at });
  const markBy = new Map<string, ReorderMark>(marks.map((m) => [m.item_id, { status: m.status, until: m.until, at: m.marked_at }]));
  const offersBy = new Map<string, OfferR[]>();
  for (const o of offers) { const l = offersBy.get(o.item_id) ?? []; l.push(o); offersBy.set(o.item_id, l); }
  const hiddenSet = new Set(hidden.map((h) => h.item_id));

  const rows: OrderRow[] = [];
  for (const it of items) {
    if (it.merged_into || hiddenSet.has(it.id)) continue;
    const ev = events.get(it.id);
    if (!ev) continue;
    const s = suggest({ events: ev, count: lastCount.get(it.id), mark: markBy.get(it.id) }, now);
    if (!s) continue;
    const d = deriveItem({
      id: it.id, name: it.name, unit: it.unit, category: it.category,
      offers: (offersBy.get(it.id) ?? []).map((o) => ({ supplierId: o.supplier_id, price: Number(o.last_price), prevPrice: o.prev_price == null ? null : Number(o.prev_price), lastDate: o.last_date })),
    }, { now, rareDays: 30, withMoney: false });
    if (!d) continue;
    const price = (sid: string) => d.offers.find((o) => o.supplierId === sid)?.price ?? 0;
    rows.push({
      itemId: it.id, name: it.name, unit: it.unit, category: it.category, s,
      bestSupplierId: d.bestSupplierId, bestPrice: price(d.bestSupplierId),
      currentSupplierId: d.currentSupplierId, currentPrice: price(d.currentSupplierId),
    });
  }
  return { rows, suppliers: Object.fromEntries(suppliers.map((s) => [s.id, s.name])) };
}

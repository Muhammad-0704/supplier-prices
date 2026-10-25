import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveItem } from './derive';
import { onecMode } from './onec/config';
import type { BoardData, BoardItem, Offer, Role, SyncInfo } from './types';

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

/** Собирает всё для доски одним проходом. Деньги сверх цены (переплата, расход) получает только руководитель. */
export async function loadBoard(db: SupabaseClient, userId: string): Promise<BoardData> {
  const { data: profile } = await db.from('profiles').select('role, full_name').eq('id', userId).single();
  const role: Role = profile?.role === 'manager' ? 'manager' : 'staff';
  const withMoney = role === 'manager';
  const rareDays = Number(process.env.NEXT_PUBLIC_RARE_DAYS || 30);

  type ItemR = { id: string; name: string; unit: string; category: string };
  type OfferR = { item_id: string; supplier_id: string; last_price: number; prev_price: number | null; last_date: string };
  type UsageR = { item_id: string; monthly_qty: number };

  const [suppliers, items, offers, usage, flags, favs, lastRun] = await Promise.all([
    all<{ id: string; name: string }>((f, t) => db.from('suppliers').select('id, name').order('name').range(f, t)),
    all<ItemR>((f, t) => db.from('items').select('id, name, unit, category').is('merged_into', null).range(f, t)),
    all<OfferR>((f, t) => db.from('offer_prices').select('item_id, supplier_id, last_price, prev_price, last_date').range(f, t)),
    withMoney ? all<UsageR>((f, t) => db.from('item_usage').select('item_id, monthly_qty').range(f, t)) : Promise.resolve([] as UsageR[]),
    all<{ item_id: string }>((f, t) => db.from('item_flags').select('item_id').eq('hidden', true).range(f, t)),
    all<{ item_id: string }>((f, t) => db.from('user_favorites').select('item_id').eq('user_id', userId).range(f, t)),
    db.from('sync_runs').select('status, finished_at, message').order('started_at', { ascending: false }).limit(1),
  ]);

  const byItem = new Map<string, Offer[]>();
  for (const o of offers) {
    const list = byItem.get(o.item_id) ?? [];
    list.push({ supplierId: o.supplier_id, price: Number(o.last_price), prevPrice: o.prev_price == null ? null : Number(o.prev_price), lastDate: o.last_date });
    byItem.set(o.item_id, list);
  }
  const qty = new Map(usage.map((u) => [u.item_id, Number(u.monthly_qty)]));
  const hidden = new Set(flags.map((f) => f.item_id));
  const fav = new Set(favs.map((f) => f.item_id));
  const now = Date.now();

  const boardItems: BoardItem[] = [];
  for (const it of items) {
    const d = deriveItem(
      { ...it, offers: byItem.get(it.id) ?? [], monthlyQty: qty.get(it.id), favorite: fav.has(it.id), hidden: hidden.has(it.id) },
      { now, rareDays, withMoney },
    );
    if (d) boardItems.push(d);
  }

  // Поставщики без единой цены на доске не нужны
  const used = new Set(boardItems.flatMap((i) => i.offers.map((o) => o.supplierId)));

  const run = lastRun.data?.[0];
  const { data: okRun } = await db.from('sync_runs').select('finished_at').eq('status', 'ok').order('finished_at', { ascending: false }).limit(1);
  const sync: SyncInfo = run
    ? { status: run.status, lastOkAt: okRun?.[0]?.finished_at ?? null, message: run.message }
    : { status: 'never', lastOkAt: null, message: null };

  return {
    role,
    userName: profile?.full_name || '',
    suppliers: suppliers.filter((s) => used.has(s.id)),
    items: boardItems.sort((a, b) => a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru')),
    sync,
    rareDays,
    mock: onecMode() === 'mock',
  };
}

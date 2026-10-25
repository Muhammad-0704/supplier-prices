import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cheaperAlternative, makeIndex, resolveMeasure, type MeasureOverride } from './compare';
import { applyOverride, deriveItem, type PriceOverride } from './derive';
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

  type SupUseR = { supplier_id: string; docs_90d: number; docs_total: number; last_date: string };
  type PropR = { item_id: string; company_name: string; price: number; created_at: string; status: 'new' | 'accepted'; min_qty: string | null };
  const [suppliers, items, offers, usage, flags, favs, lastRun, supUse, props, overrides, priceOvs] = await Promise.all([
    all<{ id: string; name: string }>((f, t) => db.from('suppliers').select('id, name').order('name').range(f, t)),
    all<ItemR>((f, t) => db.from('items').select('id, name, unit, category').is('merged_into', null).range(f, t)),
    all<OfferR>((f, t) => db.from('offer_prices').select('item_id, supplier_id, last_price, prev_price, last_date').range(f, t)),
    withMoney ? all<UsageR>((f, t) => db.from('item_usage').select('item_id, monthly_qty').range(f, t)) : Promise.resolve([] as UsageR[]),
    all<{ item_id: string }>((f, t) => db.from('item_flags').select('item_id').eq('hidden', true).range(f, t)),
    all<{ item_id: string }>((f, t) => db.from('user_favorites').select('item_id').eq('user_id', userId).range(f, t)),
    db.from('sync_runs').select('status, finished_at, message').order('started_at', { ascending: false }).limit(1),
    all<SupUseR>((f, t) => db.from('supplier_usage').select('supplier_id, docs_90d, docs_total, last_date').range(f, t)),
    all<PropR>((f, t) => db.from('latest_offers').select('item_id, company_name, price, created_at, status, min_qty').range(f, t)),
    all<MeasureOverride & { item_id: string }>((f, t) => db.from('item_measures').select('item_id, base, per_unit, disabled').range(f, t)),
    all<PriceOverride>((f, t) => db.from('price_overrides').select('item_id, supplier_id, kind, price, note, set_at, set_by_name').range(f, t)),
  ]);
  const priceOv = new Map(priceOvs.map((o) => [`${o.item_id}:${o.supplier_id}`, o]));
  const override = new Map(overrides.map((o) => [o.item_id, o]));

  const byItem = new Map<string, Offer[]>();
  for (const o of offers) {
    const list = byItem.get(o.item_id) ?? [];
    list.push(applyOverride(
      { supplierId: o.supplier_id, price: Number(o.last_price), prevPrice: o.prev_price == null ? null : Number(o.prev_price), lastDate: o.last_date },
      priceOv.get(`${o.item_id}:${o.supplier_id}`),
    ));
    byItem.set(o.item_id, list);
  }
  const qty = new Map(usage.map((u) => [u.item_id, Number(u.monthly_qty)]));
  const hidden = new Set(flags.map((f) => f.item_id));
  const fav = new Set(favs.map((f) => f.item_id));
  const now = Date.now();

  const propsByItem = new Map<string, NonNullable<BoardItem['proposals']>>();
  for (const p of props) {
    const list = propsByItem.get(p.item_id) ?? [];
    list.push({ company: p.company_name, price: Number(p.price), date: p.created_at, status: p.status, minQty: p.min_qty });
    propsByItem.set(p.item_id, list);
  }
  propsByItem.forEach((l) => l.sort((a, b) => a.price - b.price));

  const boardItems: BoardItem[] = [];
  for (const it of items) {
    const d = deriveItem(
      { ...it, offers: byItem.get(it.id) ?? [], monthlyQty: qty.get(it.id), favorite: fav.has(it.id), hidden: hidden.has(it.id) },
      { now, rareDays, withMoney },
    );
    if (d) {
      const pr = propsByItem.get(it.id);
      if (pr) d.proposals = pr;
      d.measure = resolveMeasure(it.name, it.unit, override.get(it.id));
      boardItems.push(d);
    }
  }
  // Почти такие же товары в другой фасовке, которые дешевле за кг
  const index = makeIndex(boardItems.filter((i) => !i.rare && !i.hidden));
  for (const it of boardItems) it.cheaperAlt = it.hidden ? null : cheaperAlternative(it, index);

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
    suppliers: orderByPopularity(suppliers.filter((s) => used.has(s.id)), supUse),
    items: boardItems.sort((a, b) => a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru')),
    sync,
    rareDays,
    mock: onecMode() === 'mock',
  };
}

/**
 * Колонки поставщиков по популярности: больше накладных за 90 дней — левее.
 * При равенстве — у кого накладных больше за всё время, потом кто привозил позже, потом по алфавиту.
 */
function orderByPopularity<T extends { id: string; name: string }>(list: T[], usage: { supplier_id: string; docs_90d: number; docs_total: number; last_date: string }[]): (T & { docs90d: number })[] {
  const u = new Map(usage.map((x) => [x.supplier_id, x]));
  return list
    .map((s) => ({ ...s, docs90d: Number(u.get(s.id)?.docs_90d ?? 0) }))
    .sort((a, b) => {
      const ua = u.get(a.id), ub = u.get(b.id);
      return (Number(ub?.docs_90d ?? 0) - Number(ua?.docs_90d ?? 0))
        || (Number(ub?.docs_total ?? 0) - Number(ua?.docs_total ?? 0))
        || (Date.parse(ub?.last_date ?? '0') - Date.parse(ua?.last_date ?? '0'))
        || a.name.localeCompare(b.name, 'ru');
    });
}

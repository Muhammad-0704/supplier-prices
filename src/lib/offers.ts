import 'server-only';
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyOverride, deriveItem, type PriceOverride } from './derive';

export type OfferScope = 'supplier_items' | 'categories' | 'items';

export interface OfferLink {
  id: string;
  token: string;
  supplier_id: string | null;
  company_name: string;
  scope: OfferScope;
  categories: string[];
  item_ids: string[];
  active: boolean;
  expires_at: string | null;
  note: string | null;
  created_at: string;
  last_opened_at: string | null;
  open_count: number;
}

export interface ScopeItem { id: string; name: string; unit: string; category: string }

/** Случайный токен ссылки: 24 байта, ~32 символа, подобрать невозможно. */
export function newToken(): string {
  return randomBytes(24).toString('base64url');
}

export function linkState(link: Pick<OfferLink, 'active' | 'expires_at'>, now = Date.now()): 'active' | 'disabled' | 'expired' {
  if (!link.active) return 'disabled';
  if (link.expires_at && Date.parse(link.expires_at) < now) return 'expired';
  return 'active';
}

/** Действующая ссылка по токену или null. Токен проверяется по формату до запроса в базу. */
export async function findActiveLink(db: SupabaseClient, token: string): Promise<OfferLink | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data } = await db.from('offer_links').select('*').eq('token', token).maybeSingle();
  if (!data || linkState(data) !== 'active') return null;
  return data as OfferLink;
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

/** Товары, которые видит поставщик по этой ссылке. */
export async function scopeItems(db: SupabaseClient, link: Pick<OfferLink, 'scope' | 'supplier_id' | 'categories' | 'item_ids'>): Promise<ScopeItem[]> {
  let ids: string[] | null = null;
  if (link.scope === 'supplier_items') {
    if (!link.supplier_id) return [];
    const rows = await all<{ item_id: string }>((f, t) => db.from('offer_prices').select('item_id').eq('supplier_id', link.supplier_id!).range(f, t));
    ids = [...new Set(rows.map((r) => r.item_id))];
  } else if (link.scope === 'items') {
    ids = link.item_ids;
  }
  if (ids && !ids.length) return [];

  const items: ScopeItem[] = [];
  if (ids) {
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await db.from('items').select('id, name, unit, category').is('merged_into', null).in('id', ids.slice(i, i + 300));
      items.push(...(data ?? []));
    }
  } else {
    if (!link.categories.length) return [];
    items.push(...await all<ScopeItem>((f, t) => db.from('items').select('id, name, unit, category').is('merged_into', null).in('category', link.categories).range(f, t)));
  }
  return items.sort((a, b) => a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru'));
}

/** Наша лучшая актуальная цена по товарам: та же логика, что на доске. */
export async function ourBestPrices(db: SupabaseClient, itemIds: string[]): Promise<Map<string, number>> {
  const best = new Map<string, number>();
  const rows: { item_id: string; supplier_id: string; last_price: number; prev_price: number | null; last_date: string }[] = [];
  for (let i = 0; i < itemIds.length; i += 300) {
    const { data } = await db.from('offer_prices').select('item_id, supplier_id, last_price, prev_price, last_date').in('item_id', itemIds.slice(i, i + 300));
    rows.push(...(data ?? []));
  }
  const ovs: PriceOverride[] = [];
  for (let i = 0; i < itemIds.length; i += 300) {
    const { data } = await db.from('price_overrides').select('item_id, supplier_id, kind, price, note, set_at, set_by_name').in('item_id', itemIds.slice(i, i + 300));
    ovs.push(...((data ?? []) as PriceOverride[]));
  }
  const ov = new Map(ovs.map((o) => [`${o.item_id}:${o.supplier_id}`, o]));
  const byItem = new Map<string, typeof rows>();
  rows.forEach((r) => byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), r]));
  const now = Date.now();
  byItem.forEach((list, id) => {
    const d = deriveItem({ id, name: '', unit: '', category: '', offers: list.map((r) => applyOverride({ supplierId: r.supplier_id, price: Number(r.last_price), prevPrice: r.prev_price == null ? null : Number(r.prev_price), lastDate: r.last_date }, ov.get(`${r.item_id}:${r.supplier_id}`))) }, { now, rareDays: 9999, withMoney: false });
    if (d) best.set(id, d.offers.find((o) => o.supplierId === d.bestSupplierId)!.price);
  });
  return best;
}

export type Compare = 'lower' | 'same' | 'higher' | 'unknown';

/** Сравнение без цифр: только «ниже / на уровне / выше» нашей текущей цены. */
export function compareToOurs(price: number, ours: number | undefined): Compare {
  if (!ours) return 'unknown';
  if (price < ours * 0.995) return 'lower';
  if (price > ours * 1.005) return 'higher';
  return 'same';
}

export interface OfferPayload {
  contact?: string;
  comment?: string;
  lines: { itemId?: string; customName?: string; unit?: string; price: number; minQty?: string; validUntil?: string; comment?: string }[];
}

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '') || null;

/** Проверяет и нормализует отправку поставщика. Товары вне его списка отбрасываются. */
export function validatePayload(raw: unknown, allowed: Set<string>): { ok: true; value: OfferPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Пустая отправка.' };
  const r = raw as Record<string, unknown>;
  const linesIn = Array.isArray(r.lines) ? r.lines : [];
  if (linesIn.length > 600) return { ok: false, error: 'Слишком много строк в одной отправке.' };
  const lines: OfferPayload['lines'] = [];
  let custom = 0;
  for (const l of linesIn as Record<string, unknown>[]) {
    const price = typeof l.price === 'number' ? l.price : Number(String(l.price ?? '').replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(price) || price <= 0) continue;
    if (price > 100_000_000) return { ok: false, error: 'Проверьте цену: слишком большое число.' };
    const validUntil = typeof l.validUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l.validUntil) ? l.validUntil : undefined;
    const base = { price: Math.round(price * 100) / 100, minQty: clip(l.minQty, 60) ?? undefined, validUntil, comment: clip(l.comment, 300) ?? undefined };
    if (typeof l.itemId === 'string' && l.itemId) {
      if (!allowed.has(l.itemId)) continue;
      lines.push({ itemId: l.itemId, ...base });
    } else {
      const name = clip(l.customName, 200);
      if (!name) continue;
      if (++custom > 50) return { ok: false, error: 'Не больше 50 своих товаров за раз.' };
      lines.push({ customName: name, unit: clip(l.unit, 20) ?? undefined, ...base });
    }
  }
  if (!lines.length) return { ok: false, error: 'Укажите цену хотя бы для одного товара.' };
  return { ok: true, value: { contact: clip(r.contact, 120) ?? undefined, comment: clip(r.comment, 1000) ?? undefined, lines } };
}

import type { BoardItem, DerivedOffer, Offer } from './types';

const DAY = 86_400_000;
export const STALE_GAP_DAYS = 60;

export interface DeriveInput {
  id: string;
  name: string;
  unit: string;
  category: string;
  offers: Offer[];
  monthlyQty?: number;
  favorite?: boolean;
  hidden?: boolean;
}

/**
 * Считает всё, что доска показывает по товару: лучшую цену, текущего поставщика,
 * устаревшие цены, редкость и переплату. Чистая функция, без обращения к базе.
 */
export function deriveItem(input: DeriveInput, opts: { now: number; rareDays: number; withMoney: boolean }): BoardItem | null {
  if (!input.offers.length) return null;

  const offers: DerivedOffer[] = input.offers.map((o) => {
    const t = Date.parse(o.lastDate);
    return {
      ...o,
      change: o.prevPrice && o.prevPrice > 0 ? (o.price - o.prevPrice) / o.prevPrice : 0,
      ago: Math.max(0, Math.floor((opts.now - t) / DAY)),
      stale: false,
    };
  });

  const agoAny = Math.min(...offers.map((o) => o.ago));
  for (const o of offers) o.stale = o.ago - agoAny > STALE_GAP_DAYS;

  const pool = offers.filter((o) => !o.stale);
  const best = pool.reduce((a, b) => (b.price < a.price ? b : a));
  const current = offers.reduce((a, b) => (Date.parse(b.lastDate) > Date.parse(a.lastDate) ? b : a));

  const prices = pool.map((o) => o.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  const item: BoardItem = {
    id: input.id,
    name: input.name,
    unit: input.unit,
    category: input.category,
    offers: offers.sort((a, b) => Number(a.stale) - Number(b.stale) || a.price - b.price),
    bestSupplierId: best.supplierId,
    bestPrice: best.price,
    currentSupplierId: current.supplierId,
    agoAny,
    rare: agoAny > opts.rareDays,
    spread: min > 0 ? (max - min) / min : 0,
    favorite: !!input.favorite,
    hidden: !!input.hidden,
  };

  if (opts.withMoney) {
    const overUnit = current.supplierId !== best.supplierId && !current.stale ? Math.max(0, current.price - best.price) : 0;
    const qty = input.monthlyQty ?? 0;
    item.overUnit = overUnit;
    item.monthlyQty = qty;
    item.overMonth = Math.round(overUnit * qty);
  }
  return item;
}

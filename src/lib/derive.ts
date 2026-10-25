import type { BoardItem, DerivedOffer, ManualMark, Offer } from './types';

export interface PriceOverride {
  item_id: string;
  supplier_id: string;
  kind: 'price' | 'stale';
  price: number | null;
  note: string | null;
  set_at: string;
  set_by_name: string | null;
}

/**
 * Ручные отметки поверх цен из 1С. Отметка действует, пока от поставщика не пришла накладная новее неё:
 * тогда снова главная — цена из 1С.
 */
export function applyOverride(o: Offer, ov: PriceOverride | undefined): Offer {
  if (!ov || Date.parse(o.lastDate) > Date.parse(ov.set_at)) return o;
  const manual: ManualMark = { kind: ov.kind, at: ov.set_at, by: ov.set_by_name, sourcePrice: o.price, note: ov.note };
  if (ov.kind === 'stale') return { ...o, manual };
  if (!(Number(ov.price) > 0)) return o;
  return { ...o, price: Number(ov.price), prevPrice: o.price, lastDate: ov.set_at, purchaseDate: o.lastDate, manual };
}

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
  for (const o of offers) o.stale = o.manual?.kind === 'stale' || o.ago - agoAny > STALE_GAP_DAYS;

  // Если устарели все цены — сравниваем хоть какие-то, иначе товар пропадёт с доски
  const fresh = offers.filter((o) => !o.stale);
  const pool = fresh.length ? fresh : offers;
  const best = pool.reduce((a, b) => (b.price < a.price ? b : a));
  // «Берём сейчас» — по последней закупке в 1С, ручное обновление цены на это не влияет
  const bought = (o: Offer) => Date.parse(o.purchaseDate ?? o.lastDate);
  const current = offers.reduce((a, b) => (bought(b) > bought(a) ? b : a));
  const lastBuy = Math.max(...offers.map(bought));

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
    agoAny: Math.max(0, Math.floor((opts.now - lastBuy) / DAY)),
    rare: Math.floor((opts.now - lastBuy) / DAY) > opts.rareDays,
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

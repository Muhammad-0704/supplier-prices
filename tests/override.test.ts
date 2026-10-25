import { describe, expect, it } from 'vitest';
import { applyOverride, deriveItem, type PriceOverride } from '../src/lib/derive';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const day = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const ov = (supplier: string, kind: 'price' | 'stale', price: number | null, at: string): PriceOverride => ({ item_id: 'potato', supplier_id: supplier, kind, price, note: null, set_at: at, set_by_name: 'Иван' });
const offers = [
  { supplierId: 'A', price: 30, prevPrice: 28, lastDate: day(40) },
  { supplierId: 'B', price: 45, prevPrice: null, lastDate: day(3) },
];
const derive = (list: typeof offers) => deriveItem({ id: 'potato', name: 'Картофель', unit: 'кг', category: 'Овощи', offers: list }, { now: NOW, rareDays: 30, withMoney: true })!;

describe('ручные отметки цен', () => {
  it('без отметок старая дешёвая цена считается лучшей', () => {
    expect(derive(offers).bestSupplierId).toBe('A');
  });

  it('«устарела» убирает цену из сравнения', () => {
    const d = derive([applyOverride(offers[0], ov('A', 'stale', null, day(0))), offers[1]]);
    expect(d.bestSupplierId).toBe('B');
    expect(d.offers.find((o) => o.supplierId === 'A')!.stale).toBe(true);
  });

  it('новая цена заменяет цену из 1С, но «берём сейчас» остаётся по последней закупке', () => {
    const a = applyOverride(offers[0], ov('A', 'price', 52, day(0)));
    expect(a).toMatchObject({ price: 52, prevPrice: 30, purchaseDate: offers[0].lastDate, manual: { kind: 'price', sourcePrice: 30 } });
    const d = derive([a, offers[1]]);
    expect(d.bestSupplierId).toBe('B');
    expect(d.currentSupplierId).toBe('B');
    expect(d.agoAny).toBe(3);
  });

  it('новая накладная из 1С отменяет отметку', () => {
    const fresh = { ...offers[0], price: 50, lastDate: day(0) };
    expect(applyOverride(fresh, ov('A', 'stale', null, day(1)))).toBe(fresh);
  });

  it('если устарели все цены, товар не пропадает', () => {
    const d = derive(offers.map((o) => applyOverride(o, ov(o.supplierId, 'stale', null, day(0)))));
    expect(d.bestSupplierId).toBe('A');
  });
});

import { describe, expect, it } from 'vitest';
import { deriveItem } from '../src/lib/derive';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const base = { id: 'i1', name: 'Сливки 33% 1 л', unit: 'шт', category: 'Молочка' };

describe('deriveItem', () => {
  it('находит лучшую цену и текущего поставщика, считает переплату для руководителя', () => {
    const r = deriveItem({
      ...base,
      monthlyQty: 30,
      offers: [
        { supplierId: 'a', price: 540, prevPrice: 520, lastDate: daysAgo(1) },
        { supplierId: 'b', price: 498, prevPrice: 505, lastDate: daysAgo(10) },
        { supplierId: 'c', price: 515, prevPrice: null, lastDate: daysAgo(20) },
      ],
    }, { now: NOW, rareDays: 30, withMoney: true })!;
    expect(r.bestSupplierId).toBe('b');
    expect(r.currentSupplierId).toBe('a');
    expect(r.overUnit).toBe(42);
    expect(r.overMonth).toBe(1260);
    expect(r.offers[0].supplierId).toBe('b');
    expect(r.offers.find((o) => o.supplierId === 'a')!.change).toBeCloseTo(20 / 520);
    expect(r.rare).toBe(false);
  });

  it('не показывает деньги сотруднику', () => {
    const r = deriveItem({ ...base, monthlyQty: 30, offers: [
      { supplierId: 'a', price: 540, prevPrice: null, lastDate: daysAgo(1) },
      { supplierId: 'b', price: 498, prevPrice: null, lastDate: daysAgo(3) },
    ] }, { now: NOW, rareDays: 30, withMoney: false })!;
    expect(r.overUnit).toBeUndefined();
    expect(r.overMonth).toBeUndefined();
  });

  it('устаревшая цена не участвует в выборе лучшей', () => {
    const r = deriveItem({ ...base, offers: [
      { supplierId: 'a', price: 540, prevPrice: null, lastDate: daysAgo(2) },
      { supplierId: 'old', price: 300, prevPrice: null, lastDate: daysAgo(90) },
    ] }, { now: NOW, rareDays: 30, withMoney: true })!;
    expect(r.offers.find((o) => o.supplierId === 'old')!.stale).toBe(true);
    expect(r.bestSupplierId).toBe('a');
    expect(r.overMonth).toBe(0);
  });

  it('товар без закупок дольше порога считается редким', () => {
    const r = deriveItem({ ...base, offers: [{ supplierId: 'a', price: 100, prevPrice: null, lastDate: daysAgo(45) }] }, { now: NOW, rareDays: 30, withMoney: false })!;
    expect(r.rare).toBe(true);
    expect(r.agoAny).toBe(45);
  });

  it('без предложений возвращает null', () => {
    expect(deriveItem({ ...base, offers: [] }, { now: NOW, rareDays: 30, withMoney: false })).toBeNull();
  });
});

import { shortSupplier } from '../src/lib/format';
describe('короткое название поставщика', () => {
  it('убирает форму собственности и сокращает ФИО предпринимателя', () => {
    expect(shortSupplier('ИП Недорезов Илья Игоревич')).toBe('Недорезов И.\u00a0И.');
    expect(shortSupplier('ООО «Агро-Юг»')).toBe('Агро-Юг');
    expect(shortSupplier('ТД Землянскмолоко')).toBe('Землянскмолоко');
    expect(shortSupplier('Маруф Овощи')).toBe('Маруф Овощи');
  });
});

import { softHyphens } from '../src/lib/format';
describe('мягкие переносы', () => {
  it('ставит переносы только в длинных словах', () => {
    expect(softHyphens('ТД Землянскмолоко')).toBe('ТД Землянск\u00adмолоко');
    expect(softHyphens('ТД Землянскмолоко').replace(/\u00ad/g, '')).toBe('ТД Землянскмолоко');
    expect(softHyphens('Маруф Овощи')).toBe('Маруф Овощи');
  });
});

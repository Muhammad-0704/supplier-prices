import { describe, expect, it } from 'vitest';
import { computeRhythm, packStep, roundToStep, suggest } from '../src/lib/reorder';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-25T09:00:00.000Z');
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
// Сахар: 10 мешков каждые 6 дней
const sugar = [36, 30, 24, 18, 12, 6].map((d) => ({ date: ago(d), qty: 10 }));

describe('ритм закупок', () => {
  it('промежуток, объём, расход и шаг упаковки', () => {
    const r = computeRhythm(sugar, NOW)!;
    expect(r.purchases).toBe(6);
    expect(r.intervalDays).toBe(6);
    expect(r.typicalQty).toBe(10);
    expect(r.dailyUse).toBeCloseTo(50 / 30);
    expect(r.daysSince).toBe(6);
    expect(r.step).toBe(10);
  });

  it('две строки в один день считаются одной закупкой', () => {
    const r = computeRhythm([...sugar, { date: ago(6), qty: 10 }], NOW)!;
    expect(r.purchases).toBe(6);
    expect(r.lastQty).toBe(20);
  });

  it('меньше трёх закупок — ритма нет', () => {
    expect(computeRhythm(sugar.slice(0, 2), NOW)).toBeNull();
  });

  it('шаг: кратно коробке, штучно, на вес', () => {
    expect(packStep([12, 24, 36])).toBe(12);
    expect(packStep([3, 5, 7])).toBe(1);
    expect(packStep([2.5, 3])).toBe(0);
    expect(roundToStep(13, 12)).toBe(24);
    expect(roundToStep(2.31, 0)).toBe(2.4);
    expect(roundToStep(-1, 5)).toBe(0);
  });
});

describe('что заказать', () => {
  it('по ритму: прошёл обычный промежуток — пора', () => {
    const s = suggest({ events: sugar }, NOW)!;
    expect(s.status).toBe('due');
    expect(s.basis).toBe('rhythm');
    expect(s.orderQty).toBe(10);
  });

  it('по ритму: прошло 80% промежутка — скоро', () => {
    const s2 = suggest({ events: [{ date: ago(38), qty: 5 }, { date: ago(28), qty: 5 }, { date: ago(18), qty: 5 }, { date: ago(8), qty: 5 }] }, NOW)!;
    expect(s2.status).toBe('soon');
  });

  it('перерыв в полтора раза длиннее обычного — проверить склад', () => {
    const ev = [40, 34, 28, 22, 16, 10].map((d) => ({ date: ago(d + 0), qty: 10 }));
    expect(suggest({ events: ev }, NOW)!.status).toBe('check');
  });

  it('давно не берём — не показываем', () => {
    const old = [100, 94, 88].map((d) => ({ date: ago(d), qty: 10 }));
    expect(suggest({ events: old }, NOW)).toBeNull();
  });

  it('пересчёт: на складе много — не пора, даже если ритм говорит «пора»', () => {
    const s = suggest({ events: sugar, count: { qty: 30, at: ago(0.1) } }, NOW)!;
    expect(s.basis).toBe('count');
    expect(s.status).toBe('ok');
  });

  it('пересчёт: почти ничего не осталось — пора, количество до следующего заказа с округлением', () => {
    const s = suggest({ events: sugar, count: { qty: 1, at: ago(0.1) } }, NOW)!;
    expect(s.status).toBe('due');
    // расход ~1.67/день × (6 + 2) дней ≈ 13.3, минус остаток ~0.8 → 12.5 → кратно 10 = 20
    expect(s.orderQty).toBe(20);
  });

  it('пересчёт до поставки: пришедшее после пересчёта прибавляется', () => {
    const s = suggest({ events: [...sugar.slice(0, 5), { date: ago(1), qty: 10 }], count: { qty: 0, at: ago(2) } }, NOW)!;
    expect(s.estLeft).toBeGreaterThan(5);
  });

  it('отложено — не показываем до срока; заказано — помечаем', () => {
    expect(suggest({ events: sugar, mark: { status: 'snoozed', until: ago(-3), at: ago(0) } }, NOW)).toBeNull();
    expect(suggest({ events: sugar, mark: { status: 'snoozed', until: ago(1), at: ago(5) } }, NOW)).not.toBeNull();
    expect(suggest({ events: sugar, mark: { status: 'ordered', until: null, at: ago(1) } }, NOW)!.ordered).toBe(true);
    // поставка пришла после отметки — отметка больше не действует
    expect(suggest({ events: [...sugar, { date: ago(0), qty: 10 }], mark: { status: 'ordered', until: null, at: ago(3) } }, NOW)!.ordered).toBe(false);
  });
});

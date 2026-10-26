import { describe, expect, it } from 'vitest';
import { canEditDay, grandTotal, monthRange, mskDay, parseMoney, summarize } from '../src/lib/canteens';
import { mapShipments, postedShipmentRefs } from '../src/lib/onec/map';

describe('столовые: дни и месяцы по Москве', () => {
  it('день по Москве, а не по UTC', () => {
    expect(mskDay('2026-10-25T21:30:00.000Z')).toBe('2026-10-26');
    expect(mskDay('2026-10-25T20:59:00.000Z')).toBe('2026-10-25');
  });
  it('границы месяца и переход через год', () => {
    const r = monthRange('2026-12');
    expect(r.from).toBe('2026-11-30T21:00:00.000Z');
    expect(r.to).toBe('2026-12-31T21:00:00.000Z');
    expect(r.days).toHaveLength(31);
    expect(r.next).toBe('2027-01');
    expect(monthRange('2026-01').prev).toBe('2025-12');
    expect(monthRange('2028-02').days).toHaveLength(29);
  });
});

describe('столовые: сводка', () => {
  const links = new Map([['cust-g', 'g'], ['cust-d', 'd']]);
  const ships = [
    { customer_id: 'cust-g', doc_date: '2026-10-01T06:00:00Z', amount: 1000 },
    { customer_id: 'cust-g', doc_date: '2026-10-01T22:00:00Z', amount: 500 }, // уже 2-е по Москве
    { customer_id: 'cust-d', doc_date: '2026-10-02T06:00:00Z', amount: 300.5 },
    { customer_id: 'чужой', doc_date: '2026-10-02T06:00:00Z', amount: 99999 },
  ];
  const reps = [
    { canteen_id: 'g', report_date: '2026-10-01', cash: 2000, card: 3000 },
    { canteen_id: 'g', report_date: '2026-10-02', cash: 0, card: 1000 },
  ];
  it('отгрузки по точкам и дням, выручка и фудкост', () => {
    const t = summarize(['g', 'd'], links, ships, reps);
    const g = t.get('g')!;
    expect(g.shipped).toBe(1500);
    expect(g.byDay.get('2026-10-01')!.shipped).toBe(1000);
    expect(g.byDay.get('2026-10-02')!.shipped).toBe(500);
    expect(g.revenue).toBe(6000);
    expect(g.reports).toBe(2);
    expect(g.foodcost).toBeCloseTo(0.25);
    const d = t.get('d')!;
    expect(d.shipped).toBe(300.5);
    expect(d.foodcost).toBeNull();
    expect(d.byDay.get('2026-10-02')!.reported).toBe(false);
  });
  it('общий итог', () => {
    const all = grandTotal(summarize(['g', 'd'], links, ships, reps).values());
    expect(all).toMatchObject({ shipped: 1800.5, cash: 2000, card: 4000, revenue: 6000 });
    expect(all.foodcost).toBeCloseTo(1800.5 / 6000);
  });
  it('админ видит только свои точки: чужие отчёты не считаются', () => {
    const t = summarize(['d'], links, ships, reps);
    expect([...t.keys()]).toEqual(['d']);
  });
});

describe('столовые: форма отчёта', () => {
  it('суммы с пробелами и запятой', () => {
    expect(parseMoney('12 500,50')).toBe(12500.5);
    expect(parseMoney('')).toBe(0);
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney('12.345')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });
  it('админ — сегодня и вчера, руководитель — любой прошедший день', () => {
    const now = Date.parse('2026-10-26T10:00:00+03:00');
    expect(canEditDay('2026-10-26', false, now)).toBe(true);
    expect(canEditDay('2026-10-25', false, now)).toBe(true);
    expect(canEditDay('2026-10-24', false, now)).toBe(false);
    expect(canEditDay('2026-10-24', true, now)).toBe(true);
    expect(canEditDay('2026-10-27', true, now)).toBe(false);
  });
});

describe('расходные накладные из 1С', () => {
  const EMPTY = '00000000-0000-0000-0000-000000000000';
  const docs = [
    { Ref_Key: 'r1', Number: 'РН-01 ', Date: '2026-10-26T09:00:00', Posted: true, DeletionMark: false, Контрагент_Key: 'c1', ВидОперации: 'ПродажаПокупателю' },
    { Ref_Key: 'r2', Number: 'РН-02', Date: '2026-10-26T10:00:00', Posted: false, Контрагент_Key: 'c1' },
    { Ref_Key: 'r3', Number: 'РН-03', Date: '2026-10-26T10:00:00', Posted: true, Контрагент_Key: EMPTY },
  ];
  const lines = [
    { Ref_Key: 'r1', LineNumber: 2, Номенклатура_Key: 'i2', Количество: 2, Цена: 110, Сумма: 220, Всего: 0 },
    { Ref_Key: 'r1', LineNumber: 1, Номенклатура_Key: 'i1', Количество: 1.5, Цена: 99.999, Сумма: 150, Всего: 150 },
    { Ref_Key: 'r1', LineNumber: 3, Номенклатура_Key: EMPTY, Количество: 1, Цена: 5 },
    { Ref_Key: 'r1', LineNumber: 4, Номенклатура_Key: 'i3', Количество: 3, Цена: 10 },
  ];
  it('строки только проведённых накладных с покупателем; все документы — на очистку', () => {
    expect(postedShipmentRefs(docs)).toEqual(['r1']);
    const { lines: out, docRefs } = mapShipments(docs, lines);
    expect(docRefs).toEqual(['r1', 'r2', 'r3']);
    expect(out.map((l) => l.line_no)).toEqual([1, 2, 4]);
    expect(out[0]).toMatchObject({ customer_ref: 'c1', item_ref: 'i1', qty: 1.5, price: 100, amount: 150, doc_number: 'РН-01', operation: 'ПродажаПокупателю' });
    expect(out[0].doc_date).toBe('2026-10-26T06:00:00.000Z');
    // Всего пусто → Сумма; нет и Суммы → цена × количество
    expect(out[1].amount).toBe(220);
    expect(out[2].amount).toBe(30);
  });
});

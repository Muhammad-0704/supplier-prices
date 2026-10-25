import { describe, expect, it } from 'vitest';
import { detectAlerts, findOverpays, formatAlerts, type PriceRow } from '../src/lib/alerts';

const d = (s: string) => `2026-10-${s}T09:00:00.000Z`;
const row = (doc: string, day: string, item: string, sup: string, price: number, qty = 1) => ({ onec_doc_ref: doc, line_no: 1, doc_date: d(day), item_id: item, supplier_id: sup, price, qty });

describe('сигналы о ценах', () => {
  const history: PriceRow[] = [
    row('h1', '01', 'sugar', 'A', 3000),
    row('h2', '10', 'sugar', 'A', 3100),
    row('h3', '12', 'sugar', 'B', 2950),
    row('h4', '05', 'milk', 'A', 100),
  ];

  it('подорожание на 10% и больше к прошлой цене этого поставщика', () => {
    const a = detectAlerts([row('n1', '20', 'sugar', 'A', 3410)], history);
    expect(a.map((x) => x.kind)).toEqual(['up']);
    expect(a[0].refPrice).toBe(3100);
    expect(a[0].change).toBeCloseTo(0.1);
  });

  it('рост меньше 10% сигнала не даёт', () => {
    expect(detectAlerts([row('n1', '20', 'sugar', 'A', 3400)], history)).toEqual([]);
  });

  it('дешевле прошлой цены на 10% и дешевле всех других', () => {
    const a = detectAlerts([row('n1', '20', 'sugar', 'A', 2600)], history);
    expect(a.map((x) => x.kind).sort()).toEqual(['cheapest', 'down']);
    expect(a.find((x) => x.kind === 'cheapest')!.refSupplierId).toBe('B');
    const text = formatAlerts(a, { item: () => 'Сахар', supplier: (id) => id })!;
    expect(text.match(/Сахар/g)!.length).toBe(1); // одна строка, без дубля
    expect(text).toContain('дешевле, чем у B');
  });

  it('новая строка сама с собой не сравнивается, будущие закупки не учитываются', () => {
    const fresh = row('n1', '05', 'sugar', 'A', 3500);
    const a = detectAlerts([fresh], [...history, fresh]);
    expect(a[0].kind).toBe('up');
    expect(a[0].refPrice).toBe(3000); // закупка от 10-го позже — не учитывается
  });
});

describe('переплата', () => {
  it('считает разницу с лучшей ценой другого поставщика × количество', () => {
    const hist: PriceRow[] = [row('h1', '10', 'sugar', 'B', 2950), row('h2', '11', 'sugar', 'C', 3050)];
    const o = findOverpays([row('n1', '20', 'sugar', 'A', 3100, 4)], hist);
    expect(o).toHaveLength(1);
    expect(o[0].amount).toBe(600);
    expect(o[0].bestSupplierId).toBe('B');
  });
});

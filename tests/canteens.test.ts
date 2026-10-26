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

describe('столовые: наценка склада', async () => {
  const { markupIssue, markupGap, markupRate, realCost } = await import('../src/lib/canteens');
  it('по «закупка + 10%» с допуском на округление', () => {
    expect(markupIssue({ price: 110, qty: 1, cost: 100, set_price: 110 })).toBe('ok');
    expect(markupIssue({ price: 1700, qty: 1, cost: 1543.18, set_price: 1697.5 })).toBe('ok'); // округлили до 1 700
    expect(markupIssue({ price: 65, qty: 1, cost: 58.64, set_price: 64.5 })).toBe('ok');
    expect(markupIssue({ price: 110, qty: 1, cost: 100, set_price: 99 })).toBe('ok'); // установка устарела, но цена верная
    expect(markupIssue({ price: 95, qty: 1, cost: 100, set_price: 110 })).toBe('below_cost');
    expect(markupIssue({ price: 120, qty: 1, cost: 100, set_price: 110 })).toBe('manual');
    expect(markupIssue({ price: 105, qty: 1, cost: 100, set_price: 105 })).toBe('low');
    expect(markupIssue({ price: 130, qty: 1, cost: 100, set_price: 130 })).toBe('high');
    expect(markupIssue({ price: 105, qty: 1, cost: 100, set_price: null })).toBe('low');
    expect(markupIssue({ price: 105, qty: 1, cost: null, set_price: 105 })).toBe('no_cost');
  });
  it('недополучено и наценка', () => {
    expect(markupGap({ price: 105, qty: 4, cost: 100, set_price: 105 })).toBe(20);
    expect(markupGap({ price: 120, qty: 4, cost: 100, set_price: 120 })).toBe(0);
    expect(markupRate(1150, 1000)).toBeCloseTo(0.15);
    expect(markupRate(0, 0)).toBeNull();
  });
  it('реальная себестоимость: строки без закупки оцениваются как ÷ 1,1', () => {
    expect(realCost(1210, 1100, 1000)).toBe(1100);
  });
});

describe('столовые: выгрузка в Excel', async () => {
  const { buildMonthWorkbook } = await import('../src/lib/canteens-export');
  const writeXlsxFile = (await import('write-excel-file/node')).default;
  const readXlsxFile = (await import('read-excel-file/node')).default;
  it('итог и лист на точку; файл открывается', async () => {
    const links = new Map([['cg', 'g']]);
    const totals = summarize(['g'], links, [{ customer_id: 'cg', doc_date: '2026-10-01T06:00:00Z', amount: 1100 }], [{ canteen_id: 'g', report_date: '2026-10-01', cash: 1000, card: 3000 }]);
    const costs = new Map([['g', { cost: 1000, costed: 1100, byDay: new Map([['2026-10-01', { cost: 1000, costed: 1100 }]]) }]]);
    const sheets = buildMonthWorkbook('2026-10', [{ id: 'g', name: 'Гастромания' }], totals, costs);
    expect(sheets.map((s) => s.sheet)).toEqual(['Итог', 'Гастромания']);
    expect(sheets[1].data).toHaveLength(3 + 31 + 1);
    expect(sheets[0].data[2].map((c) => (c as { value: string }).value)).toContain('Мясо');
    const buf = await writeXlsxFile(sheets as unknown as Parameters<typeof writeXlsxFile>[0]).toBuffer();
    const book = (await readXlsxFile(buf)) as unknown as { sheet: string; data: unknown[][] }[];
    expect(book.map((s) => s.sheet)).toEqual(['Итог', 'Гастромания']);
    const g = book[0].data.find((r) => r[0] === 'Гастромания')!;
    // склад, мясо, нал, безнал, выручка, фудкост, по закупочным
    expect(g.slice(1, 8)).toEqual([1100, 0, 1000, 3000, 4000, 0.275, 1000]);
  });
});

describe('столовые: Telegram', async () => {
  const { reminderText, summaryText } = await import('../src/lib/canteens-notify');
  it('напоминание про несданные точки', () => {
    const t = reminderText(['Гастромания', 'Донер Дубровка'], '2026-10-26', 'https://example.ru');
    expect(t).toContain('26.10, пн');
    expect(t).toContain('«Гастромания», «Донер Дубровка»');
    expect(t).toContain('точкам');
    expect(t).toContain('https://example.ru/canteens');
  });
  it('сводка за день: выручка, склад, фудкост, кто не сдал', () => {
    const links = new Map([['cg', 'g'], ['cd', 'd']]);
    const totals = summarize(['g', 'd'], links,
      [{ customer_id: 'cg', doc_date: '2026-10-25T06:00:00Z', amount: 2000 }, { customer_id: 'cd', doc_date: '2026-10-25T06:00:00Z', amount: 500 }],
      [{ canteen_id: 'g', report_date: '2026-10-25', cash: 3000, card: 5000 }]);
    const t = summaryText('2026-10-25', [{ id: 'g', name: 'Гастромания' }, { id: 'd', name: 'Донер <Дубровка>' }], totals, null);
    expect(t).toContain('Гастромания: выручка 8');
    expect(t).toContain('фудкост 25,0%');
    expect(t).toContain('Не сдали отчёт: Донер &lt;Дубровка&gt;');
    expect(t).not.toContain('<a href');
  });
});

describe('столовые: мясо в отчёте', () => {
  it('фудкост = (склад + мясо) ÷ выручка, по дням и за месяц', () => {
    const t = summarize(['g'], new Map([['cg', 'g']]),
      [{ customer_id: 'cg', doc_date: '2026-10-01T06:00:00Z', amount: 1000 }],
      [{ canteen_id: 'g', report_date: '2026-10-01', cash: 2000, card: 2000, meat: 600 }, { canteen_id: 'g', report_date: '2026-10-02', cash: 1000, card: 0 }]).get('g')!;
    expect(t.meat).toBe(600);
    expect(t.foodcost).toBeCloseTo(1600 / 5000);
    expect(t.byDay.get('2026-10-01')!.meat).toBe(600);
    expect(t.byDay.get('2026-10-02')!.meat).toBe(0);
    expect(grandTotal([t])).toMatchObject({ shipped: 1000, meat: 600, revenue: 5000 });
  });
});

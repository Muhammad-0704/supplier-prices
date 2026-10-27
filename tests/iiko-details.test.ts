import { describe, expect, it } from 'vitest';
import { chooseDetailFields, detailRequests, parseDishes, parseHours, parseStaff, parseVoids } from '../src/lib/iiko/details';
import { chooseSalesFields, type OlapColumns } from '../src/lib/iiko/olap';
import { byHour, byWeekday, cashiers, flow, menu, voids, weekday } from '../src/lib/iiko-insights';

const g = { groupingAllowed: true, filteringAllowed: true, aggregationAllowed: false };
const a = { aggregationAllowed: true, groupingAllowed: false };
const cols: OlapColumns = {
  'OpenDate.Typed': g, PayTypes: g, DishDiscountSumInt: a, 'UniqOrderId.OrdersCount': a, OrderDeleted: g, DeletedWithWriteoff: g,
  HourClose: g, DishName: g, DishCategory: g, DishAmountInt: a, DiscountSum: a, DishSumInt: a, Cashier: g, Storned: g,
};
const f = chooseSalesFields(cols)!;
const d = chooseDetailFields(cols);

describe('iiko: подробные отчёты', () => {
  it('выбирает поля и строит все пять запросов', () => {
    expect(d).toMatchObject({ hour: 'HourClose', dish: 'DishName', category: 'DishCategory', cashier: 'Cashier', deleted: 'DeletedWithWriteoff', storned: 'Storned' });
    const r = detailRequests(f, d, '2026-10-01', '2026-11-01');
    expect(Object.keys(r).sort()).toEqual(['deleted', 'dishes', 'hours', 'returns', 'staff']);
    expect((r.deleted!.filters as Record<string, { values: string[] }>).DeletedWithWriteoff.values).toEqual(['DELETED_WITH_WRITEOFF', 'DELETED_WITHOUT_WRITEOFF']);
    expect((r.dishes!.filters as Record<string, { values: string[] }>).Storned.values).toEqual(['FALSE']);
    expect((r.returns!.filters as Record<string, { values: string[] }>).Storned.values).toEqual(['TRUE']);
  });
  it('без полей кассира и удалений — только то, что есть', () => {
    const d2 = chooseDetailFields({ ...cols, Cashier: undefined as never, DeletedWithWriteoff: undefined as never, Storned: undefined as never });
    expect(Object.keys(detailRequests(f, d2, 'a', 'b')).sort()).toEqual(['dishes', 'hours']);
  });
  it('разбирает часы, блюда, кассиров и складывает повторы', () => {
    expect(parseHours(f, d, [
      { 'OpenDate.Typed': '2026-10-01', HourClose: '13', DishDiscountSumInt: 1000, 'UniqOrderId.OrdersCount': 4 },
      { 'OpenDate.Typed': '2026-10-01', HourClose: 13, DishDiscountSumInt: 500.5, 'UniqOrderId.OrdersCount': 2 },
      { 'OpenDate.Typed': '2026-10-01', HourClose: 'x', DishDiscountSumInt: 1 },
    ])).toEqual([{ day: '2026-10-01', hour: 13, revenue: 1500.5, checks: 6 }]);
    expect(parseDishes(f, d, [{ 'OpenDate.Typed': '01.10.2026', DishName: 'Плов', DishCategory: 'Вторые', DishAmountInt: 3, DishDiscountSumInt: 600, DiscountSum: 20 }]))
      .toEqual([{ day: '2026-10-01', dish: 'Плов', category: 'Вторые', qty: 3, revenue: 600, discount: 20 }]);
    expect(parseStaff(f, d, [{ 'OpenDate.Typed': '2026-10-01', Cashier: '', DishDiscountSumInt: 10, 'UniqOrderId.OrdersCount': 1 }])[0].cashier).toBe('Не указан');
  });
  it('удаления: со списанием и без, возвраты — по модулю', () => {
    const v = parseVoids(f, d, [
      { 'OpenDate.Typed': '2026-10-02', DeletedWithWriteoff: 'DELETED_WITHOUT_WRITEOFF', DishName: 'Манты', Cashier: 'А', DishAmountInt: 1, DishSumInt: 230 },
      { 'OpenDate.Typed': '2026-10-02', DeletedWithWriteoff: 'NOT_DELETED', DishName: 'Чай', DishAmountInt: 1, DishSumInt: 40 },
    ], [{ 'OpenDate.Typed': '2026-10-03', DishName: 'Плов', Cashier: 'Б', DishAmountInt: -1, DishDiscountSumInt: -220 }]);
    expect(v).toEqual([
      { day: '2026-10-02', kind: 'deleted', cashier: 'А', dish: 'Манты', qty: 1, amount: 230, writeoff: false },
      { day: '2026-10-03', kind: 'return', cashier: 'Б', dish: 'Плов', qty: 1, amount: 220, writeoff: null },
    ]);
  });
});

describe('Продажи: показатели', () => {
  const days = Array.from({ length: 14 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, total: i < 7 ? 30000 : 33000, checks: 100 }));
  it('поток людей и средний чек с динамикой', () => {
    const f1 = flow([...days, { day: '2026-10-15', total: 0, checks: 0 }]);
    expect(f1).toMatchObject({ checks: 1400, days: 14, perDay: 100 });
    expect(f1.avgCheck).toBeCloseTo(315);
    expect(f1.avgCheckTrend!.last).toBe(330);
    expect(f1.avgCheckTrend!.change).toBeCloseTo(0.1);
  });
  it('дни недели: 1 октября 2026 — четверг', () => {
    expect(weekday('2026-10-01')).toBe(3);
    const w = byWeekday(days);
    expect(w[3]).toMatchObject({ label: 'Чт', days: 2, checks: 100 });
  });
  it('часы: среднее за день и пик', () => {
    const h = byHour([
      { day: '1', hour: 12, revenue: 100, checks: 10 }, { day: '1', hour: 14, revenue: 50, checks: 4 },
      { day: '2', hour: 12, revenue: 100, checks: 20 },
    ]);
    expect(h.hours.map((x) => x.hour)).toEqual([12, 13, 14]);
    expect(h.peak).toMatchObject({ hour: 12, checks: 15 });
    expect(h.hours[1].checks).toBe(0);
  });
  it('меню: топ, слабые, скидки, категории', () => {
    const rows = ['01', '02', '03'].flatMap((dd) => [
      { day: `2026-10-${dd}`, dish: 'Плов', category: 'Вторые', qty: 10, revenue: 2000, discount: 100 },
      { day: `2026-10-${dd}`, dish: 'Печень', category: 'Вторые', qty: 1, revenue: 170, discount: 0 },
      { day: `2026-10-${dd}`, dish: 'Чай', category: 'Напитки', qty: 20, revenue: 800, discount: 0 },
    ]);
    const m = menu(rows, 2, 5);
    expect(m.top.map((x) => x.dish)).toEqual(['Плов', 'Чай']);
    expect(m.slow.map((x) => x.dish)).toEqual(['Печень']);
    expect(m.discountShare).toBeCloseTo(300 / (8910 + 300));
    expect(m.categories[0]).toMatchObject({ category: 'Вторые' });
  });
  it('кассиры и удаления: доля на 1000 ₽', () => {
    const vs = [
      { day: '1', kind: 'deleted' as const, cashier: 'А', dish: 'x', qty: 1, amount: 200, writeoff: false },
      { day: '2', kind: 'return' as const, cashier: 'Б', dish: 'y', qty: 1, amount: 100, writeoff: null },
    ];
    const c = cashiers([{ day: '1', cashier: 'А', revenue: 10000, checks: 40, discount: 0 }, { day: '1', cashier: 'Б', revenue: 20000, checks: 60, discount: 50 }], vs);
    expect(c.map((x) => x.cashier)).toEqual(['Б', 'А']);
    expect(c[1].voidRate).toBe(20);
    expect(c[0].voidRate).toBe(5);
    expect(voids(vs).deleted).toEqual({ count: 1, amount: 200, noWriteoff: 200 });
  });
});

/**
 * Продажи точки за месяц из iiko для экрана «Продажи»: поток людей, средний чек, дни недели, часы,
 * категории и блюда, кассиры, удаления и возвраты. Чистые функции — проверяются тестами.
 */

export interface RevDay { day: string; total: number; checks: number }
export interface HourIn { day: string; hour: number; revenue: number; checks: number }
export interface DishIn { day: string; dish: string; category: string; qty: number; revenue: number; discount: number }
export interface StaffIn { day: string; cashier: string; revenue: number; checks: number; discount: number }
export interface VoidIn { day: string; kind: 'deleted' | 'return'; cashier: string; dish: string; qty: number; amount: number; writeoff: boolean | null }

const r2 = (v: number) => Math.round(v * 100) / 100;
const div = (a: number, b: number) => (b > 0 ? a / b : null);

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
/** 0 = понедельник */
export const weekday = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;

export interface Flow {
  revenue: number; checks: number; days: number;
  avgCheck: number | null;
  /** Людей (чеков) в среднем за день */
  perDay: number | null;
  best: { day: string; checks: number } | null;
  /** Средний чек последних 7 дней с чеками против 7 дней до них */
  avgCheckTrend: { last: number; prev: number; change: number } | null;
  byDay: { day: string; checks: number; revenue: number; avgCheck: number | null }[];
}

export function flow(days: RevDay[]): Flow {
  const live = days.filter((d) => d.checks > 0).sort((a, b) => a.day.localeCompare(b.day));
  const revenue = live.reduce((s, d) => s + d.total, 0);
  const checks = live.reduce((s, d) => s + d.checks, 0);
  const best = live.reduce<RevDay | null>((m, d) => (!m || d.checks > m.checks ? d : m), null);
  const avg = (xs: RevDay[]) => div(xs.reduce((s, d) => s + d.total, 0), xs.reduce((s, d) => s + d.checks, 0));
  const last = avg(live.slice(-7)), prev = live.length >= 14 ? avg(live.slice(-14, -7)) : null;
  return {
    revenue: r2(revenue), checks, days: live.length,
    avgCheck: div(revenue, checks), perDay: div(checks, live.length),
    best: best ? { day: best.day, checks: best.checks } : null,
    avgCheckTrend: last != null && prev != null ? { last, prev, change: last / prev - 1 } : null,
    byDay: days.slice().sort((a, b) => a.day.localeCompare(b.day)).map((d) => ({ day: d.day, checks: d.checks, revenue: d.total, avgCheck: div(d.total, d.checks) })),
  };
}

export interface WeekdayStat { wd: number; label: string; days: number; checks: number | null; revenue: number | null; avgCheck: number | null }

/** Средний день недели: сколько людей и выручки обычно бывает в понедельник, вторник… */
export function byWeekday(days: RevDay[]): WeekdayStat[] {
  const acc = WEEKDAYS.map(() => ({ days: 0, checks: 0, revenue: 0 }));
  for (const d of days) {
    if (d.checks <= 0) continue;
    const a = acc[weekday(d.day)];
    a.days += 1; a.checks += d.checks; a.revenue += d.total;
  }
  return acc.map((a, wd) => ({ wd, label: WEEKDAYS[wd], days: a.days, checks: div(a.checks, a.days), revenue: div(a.revenue, a.days), avgCheck: div(a.revenue, a.checks) }));
}

export interface HourStat { hour: number; checks: number; revenue: number; share: number }

/** Средний день по часам: чеков и выручки в этот час в среднем за день с продажами */
export function byHour(hours: HourIn[]): { hours: HourStat[]; peak: HourStat | null } {
  const days = new Set(hours.filter((h) => h.checks > 0 || h.revenue > 0).map((h) => h.day)).size;
  if (!days) return { hours: [], peak: null };
  const acc = new Map<number, { checks: number; revenue: number }>();
  for (const h of hours) {
    const a = acc.get(h.hour) ?? { checks: 0, revenue: 0 };
    a.checks += h.checks; a.revenue += h.revenue;
    acc.set(h.hour, a);
  }
  const totalChecks = [...acc.values()].reduce((s, a) => s + a.checks, 0);
  const keys = [...acc.keys()].filter((k) => (acc.get(k)!.checks > 0 || acc.get(k)!.revenue > 0));
  if (!keys.length) return { hours: [], peak: null };
  const lo = Math.min(...keys), hi = Math.max(...keys);
  const out: HourStat[] = [];
  for (let h = lo; h <= hi; h++) {
    const a = acc.get(h) ?? { checks: 0, revenue: 0 };
    out.push({ hour: h, checks: a.checks / days, revenue: a.revenue / days, share: totalChecks ? a.checks / totalChecks : 0 });
  }
  const peak = out.reduce<HourStat | null>((m, x) => (!m || x.checks > m.checks ? x : m), null);
  return { hours: out, peak };
}

export interface DishStat { dish: string; category: string; qty: number; revenue: number; share: number; price: number | null; days: number; lastDay: string }
export interface CategoryStat { category: string; qty: number; revenue: number; share: number }

export interface Menu {
  revenue: number;
  discount: number;
  /** Доля скидок от выручки до скидки */
  discountShare: number | null;
  categories: CategoryStat[];
  top: DishStat[];
  /** Продаются хуже всего: меньше всего штук за месяц (без разовых позиций, проданных 1–2 раза) */
  slow: DishStat[];
  dishes: number;
}

export function menu(rows: DishIn[], topN = 15, slowN = 10): Menu {
  const dishes = new Map<string, { category: string; qty: number; revenue: number; days: Set<string>; lastDay: string }>();
  const cats = new Map<string, { qty: number; revenue: number }>();
  let revenue = 0, discount = 0;
  for (const r of rows) {
    revenue += r.revenue; discount += r.discount;
    const d = dishes.get(r.dish) ?? { category: r.category, qty: 0, revenue: 0, days: new Set<string>(), lastDay: r.day };
    d.qty += r.qty; d.revenue += r.revenue; d.days.add(r.day);
    if (r.day > d.lastDay) d.lastDay = r.day;
    dishes.set(r.dish, d);
    const c = cats.get(r.category) ?? { qty: 0, revenue: 0 };
    c.qty += r.qty; c.revenue += r.revenue;
    cats.set(r.category, c);
  }
  const list: DishStat[] = [...dishes].map(([dish, d]) => ({
    dish, category: d.category, qty: Math.round(d.qty * 1000) / 1000, revenue: r2(d.revenue),
    share: revenue ? d.revenue / revenue : 0, price: div(d.revenue, d.qty), days: d.days.size, lastDay: d.lastDay,
  }));
  const top = [...list].sort((a, b) => b.revenue - a.revenue).slice(0, topN);
  const topSet = new Set(top.map((d) => d.dish));
  const slow = list.filter((d) => d.qty > 0 && d.days >= 3 && !topSet.has(d.dish)).sort((a, b) => a.qty - b.qty || a.revenue - b.revenue).slice(0, slowN);
  return {
    revenue: r2(revenue), discount: r2(discount), discountShare: div(discount, revenue + discount),
    categories: [...cats].map(([category, c]) => ({ category, qty: c.qty, revenue: r2(c.revenue), share: revenue ? c.revenue / revenue : 0 })).sort((a, b) => b.revenue - a.revenue),
    top, slow, dishes: list.length,
  };
}

export interface CashierStat {
  cashier: string; revenue: number; checks: number; avgCheck: number | null; discount: number; days: number;
  deleted: { count: number; amount: number };
  returns: { count: number; amount: number };
  /** Удалено и возвращено на 1000 ₽ выручки — чем выше, тем внимательнее смотреть */
  voidRate: number | null;
}

export interface Voids {
  deleted: { count: number; amount: number; noWriteoff: number };
  returns: { count: number; amount: number };
  list: VoidIn[];
}

export function voids(rows: VoidIn[], limit = 300): Voids {
  const del = rows.filter((v) => v.kind === 'deleted');
  const ret = rows.filter((v) => v.kind === 'return');
  const sum = (xs: VoidIn[]) => r2(xs.reduce((s, v) => s + v.amount, 0));
  return {
    deleted: { count: del.length, amount: sum(del), noWriteoff: sum(del.filter((v) => v.writeoff === false)) },
    returns: { count: ret.length, amount: sum(ret) },
    list: [...rows].sort((a, b) => b.day.localeCompare(a.day) || b.amount - a.amount).slice(0, limit),
  };
}

export function cashiers(staff: StaffIn[], voidRows: VoidIn[]): CashierStat[] {
  const m = new Map<string, CashierStat & { _days: Set<string> }>();
  const get = (name: string) => {
    let x = m.get(name);
    if (!x) {
      x = { cashier: name, revenue: 0, checks: 0, avgCheck: null, discount: 0, days: 0, deleted: { count: 0, amount: 0 }, returns: { count: 0, amount: 0 }, voidRate: null, _days: new Set() };
      m.set(name, x);
    }
    return x;
  };
  for (const s of staff) {
    const x = get(s.cashier);
    x.revenue += s.revenue; x.checks += s.checks; x.discount += s.discount;
    if (s.checks > 0 || s.revenue > 0) x._days.add(s.day);
  }
  for (const v of voidRows) {
    const t = v.kind === 'deleted' ? get(v.cashier).deleted : get(v.cashier).returns;
    t.count += 1; t.amount += v.amount;
  }
  return [...m.values()].map(({ _days, ...x }) => ({
    ...x, revenue: r2(x.revenue), discount: r2(x.discount), days: _days.size, avgCheck: div(x.revenue, x.checks),
    deleted: { count: x.deleted.count, amount: r2(x.deleted.amount) }, returns: { count: x.returns.count, amount: r2(x.returns.amount) },
    voidRate: x.revenue > 0 ? ((x.deleted.amount + x.returns.amount) / x.revenue) * 1000 : null,
  })).sort((a, b) => b.revenue - a.revenue);
}

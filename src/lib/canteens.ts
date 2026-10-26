/** Расчёты сервиса «Столовые»: дни по Москве, суммы по точкам и дням. Без обращений к базе — проверяются тестами. */

const TZ = 'Europe/Moscow';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });

/** Календарный день по Москве: 2026-10-26 */
export function mskDay(t: string | number | Date): string {
  return dayFmt.format(typeof t === 'string' ? Date.parse(t) : t);
}

/** Текущий месяц по Москве: 2026-10 */
export function mskMonth(now = Date.now()): string {
  return mskDay(now).slice(0, 7);
}

export function isMonth(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** Границы месяца: с полуночи 1-го по Москве до полуночи 1-го следующего, и список дней. */
export function monthRange(month: string): { from: string; to: string; days: string[]; prev: string; next: string } {
  const [y, m] = month.split('-').map(Number);
  const from = new Date(`${month}-01T00:00:00+03:00`).toISOString();
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  const pad = (v: number) => String(v).padStart(2, '0');
  const next = `${ny}-${pad(nm)}`;
  const to = new Date(`${next}-01T00:00:00+03:00`).toISOString();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`);
  return { from, to, days, prev: `${py}-${pad(pm)}`, next };
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
}

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
/** 26.10, пн */
export function dayTitle(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}, ${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
}

export interface ShipmentRow { customer_id: string; doc_date: string; amount: number }
/** Ежедневный отчёт точки. meat — сумма мяса за день по накладным мясного магазина (админ пишет сам) */
export interface ReportRow { canteen_id: string; report_date: string; cash: number; card: number; meat?: number }

/** Выручка точки за день из iiko */
export interface IikoRow { canteen_id: string; day: string; cash: number; card: number; total: number; checks?: number }

/**
 * Итоги дня. shipped — со склада по расходным; meat — мясо из отчёта; закупки точки = shipped + meat.
 * cash / card / revenue — из iiko, если по точке за этот день есть данные iiko, иначе из отчёта админа.
 */
export interface DayTotals {
  shipped: number; meat: number; cash: number; card: number; revenue: number;
  /** Админ сдал отчёт за день */
  reported: boolean;
  /** Выручка за день известна (из iiko или из отчёта) */
  hasRevenue: boolean;
  /** Откуда выручка */
  source: 'iiko' | 'report' | null;
  /** Цифры из отчёта админа — для сверки с iiko */
  reportCash: number; reportCard: number;
  checks: number;
}
export interface CanteenTotals {
  shipped: number; meat: number; cash: number; card: number; revenue: number;
  /** Дней с отчётом */
  reports: number;
  /** Дней с выручкой из iiko */
  iikoDays: number;
  /** Закупки ÷ выручка; null, если выручки нет */
  foodcost: number | null;
  byDay: Map<string, DayTotals>;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Фудкост = закупки (склад + мясо) ÷ выручка; null, если выручки нет */
export function foodcost(purchases: number, revenue: number): number | null {
  return revenue > 0 ? purchases / revenue : null;
}

/** Расхождение отчёта админа с iiko больше 1% или 100 ₽ */
export function reportMismatch(x: DayTotals): number | null {
  if (x.source !== 'iiko' || !x.reported) return null;
  const diff = x.reportCash + x.reportCard - x.revenue;
  return Math.abs(diff) > Math.max(100, x.revenue * 0.01) ? r2(diff) : null;
}

/**
 * Сводка по точкам: отгружено со склада по расходным, выручка (iiko или отчёт), мясо из отчётов, фудкост.
 * customerCanteen — какому покупателю 1С какая точка соответствует.
 */
export function summarize(canteenIds: string[], customerCanteen: Map<string, string>, shipments: ShipmentRow[], reports: ReportRow[], iiko: IikoRow[] = []): Map<string, CanteenTotals> {
  const out = new Map<string, CanteenTotals>();
  const get = (c: string) => {
    let t = out.get(c);
    if (!t) { t = { shipped: 0, meat: 0, cash: 0, card: 0, revenue: 0, reports: 0, iikoDays: 0, foodcost: null, byDay: new Map() }; out.set(c, t); }
    return t;
  };
  const day = (t: CanteenTotals, d: string) => {
    let x = t.byDay.get(d);
    if (!x) { x = { shipped: 0, meat: 0, cash: 0, card: 0, revenue: 0, reported: false, hasRevenue: false, source: null, reportCash: 0, reportCard: 0, checks: 0 }; t.byDay.set(d, x); }
    return x;
  };
  canteenIds.forEach(get);
  for (const s of shipments) {
    const c = customerCanteen.get(s.customer_id);
    if (!c || !out.has(c)) continue;
    day(get(c), mskDay(s.doc_date)).shipped += Number(s.amount) || 0;
  }
  for (const r of reports) {
    if (!out.has(r.canteen_id)) continue;
    const x = day(get(r.canteen_id), r.report_date);
    x.reportCash += Number(r.cash) || 0;
    x.reportCard += Number(r.card) || 0;
    x.meat += Number(r.meat) || 0;
    x.reported = true;
  }
  for (const i of iiko) {
    if (!out.has(i.canteen_id)) continue;
    const x = day(get(i.canteen_id), i.day);
    x.cash = Number(i.cash) || 0;
    x.card = Number(i.card) || 0;
    x.revenue = Number(i.total) || x.cash + x.card;
    x.checks = Number(i.checks) || 0;
    x.source = 'iiko';
  }
  for (const t of out.values()) {
    for (const x of t.byDay.values()) {
      if (x.source !== 'iiko' && x.reported) {
        x.cash = x.reportCash; x.card = x.reportCard; x.revenue = x.reportCash + x.reportCard; x.source = 'report';
      }
      x.hasRevenue = x.source !== null;
      x.shipped = r2(x.shipped); x.meat = r2(x.meat); x.cash = r2(x.cash); x.card = r2(x.card); x.revenue = r2(x.revenue);
      t.shipped += x.shipped; t.meat += x.meat; t.cash += x.cash; t.card += x.card; t.revenue += x.revenue;
      if (x.reported) t.reports += 1;
      if (x.source === 'iiko') t.iikoDays += 1;
    }
    t.shipped = r2(t.shipped); t.meat = r2(t.meat); t.cash = r2(t.cash); t.card = r2(t.card); t.revenue = r2(t.revenue);
    t.foodcost = foodcost(t.shipped + t.meat, t.revenue);
  }
  return out;
}

/** Итог по всем точкам */
export function grandTotal(totals: Iterable<CanteenTotals>): { shipped: number; meat: number; cash: number; card: number; revenue: number; foodcost: number | null } {
  let shipped = 0, meat = 0, cash = 0, card = 0;
  for (const t of totals) { shipped += t.shipped; meat += t.meat; cash += t.cash; card += t.card; }
  const revenue = cash + card;
  return { shipped: r2(shipped), meat: r2(meat), cash: r2(cash), card: r2(card), revenue: r2(revenue), foodcost: foodcost(shipped + meat, revenue) };
}

/** Сумма из формы: «12 500,50» → 12500.5; пусто → 0; мусор → null */
export function parseMoney(v: unknown): number | null {
  const s = String(v ?? '').replace(/[\s ₽]/g, '').replace(',', '.');
  if (!s) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n <= 100_000_000 ? n : null;
}

/** Админ сдаёт отчёт за сегодня и вчера; руководитель — за любой прошедший день. */
export function canEditDay(day: string, manager: boolean, now = Date.now()): boolean {
  const today = mskDay(now);
  if (day > today) return false;
  return manager || day >= mskDay(now - 86_400_000);
}

// ---------- Наценка склада ----------

/** Наценка склада на закупочную цену */
export const MARKUP = 0.1;
/**
 * Допуск на округление: в «Установке цен» цены с копейками (1 697,50), в расходных их округляют
 * до рубля или до пятёрки (1 700). Разница до 1 ₽ или до 0,5% цены — не расхождение.
 */
export const tolerance = (price: number) => Math.max(1, Math.abs(price) * 0.005);

export type MarkupIssue = 'ok' | 'no_cost' | 'below_cost' | 'manual' | 'low' | 'high';

export interface CostLine { price: number; qty: number; cost: number | null; set_price: number | null }

/**
 * Проверка строки расходной против «последняя закупка + 10%»:
 *  ok         — цена расходной сходится с «закупка + 10%» с учётом округления (даже если в установке цен старая цена);
 *  below_cost — продали дешевле последней закупки;
 *  manual     — цена не сходится и в накладной стоит не установленная цена (поставили руками);
 *  low / high — накладная выписана по установленной цене, но установка устарела: закупка подорожала / подешевела.
 */
export function markupIssue(l: CostLine): MarkupIssue {
  if (l.cost == null || l.cost <= 0) return 'no_cost';
  if (l.price < l.cost - 0.005) return 'below_cost';
  const expected = l.cost * (1 + MARKUP);
  if (Math.abs(l.price - expected) <= tolerance(expected)) return 'ok';
  if (l.set_price != null && Math.abs(l.price - l.set_price) > tolerance(l.set_price)) return 'manual';
  return l.price < expected ? 'low' : 'high';
}

/** Ожидаемая цена: последняя закупка + 10% */
export const expectedPrice = (cost: number) => Math.round(cost * (1 + MARKUP) * 100) / 100;

/** Сколько наценки недополучено по строке (только когда цена ниже ожидаемой) */
export function markupGap(l: CostLine): number {
  if (l.cost == null) return 0;
  const gap = (l.cost * (1 + MARKUP) - l.price) * l.qty;
  return gap > 0 ? Math.round(gap * 100) / 100 : 0;
}

/** Наценка склада: по расходным ÷ по закупочным − 1 (только строки, где известна закупка) */
export function markupRate(costedAmount: number, costAmount: number): number | null {
  return costAmount > 0 ? costedAmount / costAmount - 1 : null;
}

/**
 * Отгружено по закупочным ценам. Строки, где закупка неизвестна, оцениваются как «по расходной ÷ 1,1»,
 * чтобы реальный фудкост не занижался из-за пары товаров без истории закупок.
 */
export function realCost(amount: number, costed: number, cost: number): number {
  return Math.round((cost + Math.max(0, amount - costed) / (1 + MARKUP)) * 100) / 100;
}

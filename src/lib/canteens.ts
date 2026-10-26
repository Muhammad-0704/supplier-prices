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
export interface ReportRow { canteen_id: string; report_date: string; cash: number; card: number }

export interface DayTotals { shipped: number; cash: number; card: number; revenue: number; reported: boolean }
export interface CanteenTotals extends Omit<DayTotals, 'reported'> {
  /** Дней с отчётом */
  reports: number;
  /** Отгружено ÷ выручка; null, если выручки нет */
  foodcost: number | null;
  byDay: Map<string, DayTotals>;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Сводка по точкам: отгружено со склада по расходным, наличные и безнал из отчётов, фудкост.
 * customerCanteen — какому покупателю 1С какая точка соответствует.
 */
export function summarize(canteenIds: string[], customerCanteen: Map<string, string>, shipments: ShipmentRow[], reports: ReportRow[]): Map<string, CanteenTotals> {
  const out = new Map<string, CanteenTotals>();
  const get = (c: string) => {
    let t = out.get(c);
    if (!t) { t = { shipped: 0, cash: 0, card: 0, revenue: 0, reports: 0, foodcost: null, byDay: new Map() }; out.set(c, t); }
    return t;
  };
  const day = (t: CanteenTotals, d: string) => {
    let x = t.byDay.get(d);
    if (!x) { x = { shipped: 0, cash: 0, card: 0, revenue: 0, reported: false }; t.byDay.set(d, x); }
    return x;
  };
  canteenIds.forEach(get);
  for (const s of shipments) {
    const c = customerCanteen.get(s.customer_id);
    if (!c || !out.has(c)) continue;
    const t = get(c);
    const amount = Number(s.amount) || 0;
    t.shipped += amount;
    day(t, mskDay(s.doc_date)).shipped += amount;
  }
  for (const r of reports) {
    if (!out.has(r.canteen_id)) continue;
    const t = get(r.canteen_id);
    const cash = Number(r.cash) || 0, card = Number(r.card) || 0;
    t.cash += cash; t.card += card; t.revenue += cash + card; t.reports += 1;
    const x = day(t, r.report_date);
    x.cash += cash; x.card += card; x.revenue += cash + card; x.reported = true;
  }
  for (const t of out.values()) {
    t.shipped = r2(t.shipped); t.cash = r2(t.cash); t.card = r2(t.card); t.revenue = r2(t.revenue);
    t.foodcost = t.revenue > 0 ? t.shipped / t.revenue : null;
  }
  return out;
}

/** Итог по всем точкам */
export function grandTotal(totals: Iterable<CanteenTotals>): { shipped: number; cash: number; card: number; revenue: number; foodcost: number | null } {
  let shipped = 0, cash = 0, card = 0;
  for (const t of totals) { shipped += t.shipped; cash += t.cash; card += t.card; }
  const revenue = cash + card;
  return { shipped: r2(shipped), cash: r2(cash), card: r2(card), revenue: r2(revenue), foodcost: revenue > 0 ? shipped / revenue : null };
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

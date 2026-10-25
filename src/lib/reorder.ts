/**
 * Помощник заказа без опоры на остатки 1С.
 * Ритм закупок: как часто и сколько обычно берём товар. Пересчёт склада с телефона уточняет, сколько осталось.
 * Чистые функции, без обращения к базе.
 */

const DAY = 86_400_000;
const MSK = 3 * 3_600_000;

export interface PurchaseEvent {
  /** ISO-дата накладной */
  date: string;
  qty: number;
}

export interface StockCount {
  qty: number;
  /** ISO-время пересчёта */
  at: string;
}

export interface ReorderMark {
  status: 'ordered' | 'snoozed';
  /** Для «отложить»: до какого момента не напоминать */
  until: string | null;
  /** Когда отметили */
  at: string;
}

export interface Rhythm {
  /** Сколько дней с закупками в окне */
  purchases: number;
  /** Обычный промежуток между закупками, дней (медиана) */
  intervalDays: number;
  /** Обычный объём одной закупки (медиана) */
  typicalQty: number;
  /** Средний расход в день по ритму закупок */
  dailyUse: number;
  /** День последней закупки, ISO */
  lastDate: string;
  lastQty: number;
  /** Дней с последней закупки */
  daysSince: number;
  /** Шаг округления: берёте всегда кратно ему (коробки, мешки). 0 — дробное количество */
  step: number;
}

/** due — пора; soon — скоро; check — не брали заметно дольше обычного, проверьте склад; ok — хватает */
export type ReorderStatus = 'due' | 'soon' | 'check' | 'ok';

export interface Suggestion {
  rhythm: Rhythm;
  status: ReorderStatus;
  /** По чему решили: по пересчёту склада или только по ритму */
  basis: 'count' | 'rhythm';
  /** Оценка остатка сейчас (только при пересчёте) */
  estLeft: number | null;
  /** На сколько дней хватит (только при пересчёте) */
  daysLeft: number | null;
  /** Сколько предлагаем заказать */
  orderQty: number;
  /** Когда пересчитывали, если пересчёт учтён */
  countAt: string | null;
  /** Отмечено «заказано», но товар ещё не пришёл */
  ordered: boolean;
}

export interface ReorderOptions {
  /** «Пора», когда прошло столько долей обычного промежутка */
  dueRatio: number;
  /** «Скоро» */
  soonRatio: number;
  /** «Проверить»: перерыв намного длиннее обычного — возможно, брали в другом месте или запас ещё есть */
  checkRatio: number;
  /** Запас дней: заказ привозят не сразу */
  leadDays: number;
  /** Минимум дней с закупками, чтобы считать ритм */
  minPurchases: number;
  /** «Заказано» скрывает товар на столько дней, если поставка так и не пришла */
  orderedHoldDays: number;
}

export const DEFAULT_OPTIONS: ReorderOptions = { dueRatio: 1, soonRatio: 0.8, checkRatio: 1.5, leadDays: 2, minPurchases: 3, orderedHoldDays: 5 };

/** Номер московского дня */
const dayNo = (t: number) => Math.floor((t + MSK) / DAY);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Шаг упаковки: если все закупки целые и кратны одному числу ≥ 2, это коробка или мешок. */
export function packStep(qtys: number[]): number {
  if (!qtys.length) return 1;
  const ints = qtys.every((q) => Math.abs(q - Math.round(q)) < 1e-6);
  if (!ints) return 0;
  const g = qtys.map((q) => Math.round(q)).reduce((a, b) => gcd(a, b));
  return g >= 2 ? g : 1;
}

export function roundToStep(q: number, step: number): number {
  if (q <= 0) return 0;
  if (step === 0) return Math.ceil(q * 10) / 10;
  return Math.max(step, Math.ceil(q / step - 1e-9) * step);
}

/** Ритм закупок товара. null — закупок слишком мало, чтобы говорить о ритме. */
export function computeRhythm(events: PurchaseEvent[], now: number, minPurchases = DEFAULT_OPTIONS.minPurchases): Rhythm | null {
  const byDay = new Map<number, number>();
  for (const e of events) {
    if (!(e.qty > 0)) continue;
    const d = dayNo(Date.parse(e.date));
    byDay.set(d, (byDay.get(d) ?? 0) + e.qty);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  if (days.length < minPurchases) return null;

  const gaps = days.slice(1).map((d, i) => d - days[i]);
  const qtys = days.map((d) => byDay.get(d)!);
  const first = days[0], last = days[days.length - 1];
  const lastQty = byDay.get(last)!;
  // Расход: всё, что купили до последней закупки, ушло за период от первой до последней
  const used = qtys.reduce((s, q) => s + q, 0) - lastQty;
  const span = last - first;

  return {
    purchases: days.length,
    intervalDays: Math.max(1, median(gaps)),
    typicalQty: median(qtys),
    dailyUse: span > 0 ? used / span : 0,
    lastDate: new Date(last * DAY - MSK).toISOString(),
    lastQty,
    daysSince: Math.max(0, dayNo(now) - last),
    step: packStep(qtys),
  };
}

/**
 * Решение по одному товару. null — товар не показываем: ритма нет, давно не берём (похоже, выведен) или отложен.
 */
export function suggest(
  input: { events: PurchaseEvent[]; count?: StockCount | null; mark?: ReorderMark | null },
  now: number,
  o: ReorderOptions = DEFAULT_OPTIONS,
): Suggestion | null {
  const r = computeRhythm(input.events, now, o.minPurchases);
  if (!r) return null;

  // Давно не берём — скорее всего товар больше не нужен
  if (r.daysSince > Math.max(2.5 * r.intervalDays, r.intervalDays + 21)) return null;

  const lastT = Date.parse(r.lastDate) + DAY; // конец дня последней закупки
  let ordered = false;
  if (input.mark) {
    const at = Date.parse(input.mark.at);
    if (input.mark.status === 'snoozed' && input.mark.until && Date.parse(input.mark.until) > now) return null;
    // «Заказано» действует, пока не пришла новая закупка, но не дольше orderedHoldDays
    if (input.mark.status === 'ordered' && at >= lastT - DAY && now - at < o.orderedHoldDays * DAY) ordered = true;
  }

  const cover = r.intervalDays + o.leadDays;
  let status: ReorderStatus;
  let basis: Suggestion['basis'] = 'rhythm';
  let estLeft: number | null = null;
  let daysLeft: number | null = null;
  let orderQty: number;
  let countAt: string | null = null;

  // Пересчёт учитываем, если он не старше обычного промежутка (минимум две недели)
  const c = input.count;
  const cAge = c ? (now - Date.parse(c.at)) / DAY : Infinity;
  if (c && cAge >= 0 && cAge <= Math.max(14, r.intervalDays) && r.dailyUse > 0) {
    const cT = Date.parse(c.at);
    const boughtAfter = input.events.filter((e) => Date.parse(e.date) > cT && e.qty > 0).reduce((s, e) => s + e.qty, 0);
    estLeft = Math.max(0, c.qty + boughtAfter - r.dailyUse * cAge);
    daysLeft = estLeft / r.dailyUse;
    basis = 'count';
    countAt = c.at;
    status = daysLeft <= o.leadDays ? 'due' : daysLeft <= o.leadDays + Math.max(2, r.intervalDays * 0.25) ? 'soon' : 'ok';
    orderQty = roundToStep(r.dailyUse * cover - estLeft, r.step);
    if (orderQty <= 0) status = 'ok';
  } else {
    const ratio = r.daysSince / r.intervalDays;
    status = ratio >= o.checkRatio ? 'check' : ratio >= o.dueRatio ? 'due' : ratio >= o.soonRatio ? 'soon' : 'ok';
    orderQty = roundToStep(r.typicalQty, r.step);
  }

  return { rhythm: r, status, basis, estLeft, daysLeft, orderQty, countAt, ordered };
}

/**
 * Цифры «Центра Питания» для экранов, Excel и Telegram в одном месте.
 *
 * Склад: у руководителя — по закупочным ценам (последняя закупка до даты отгрузки), у админа точки — по ценам
 * расходных (закупочных цен он не видит). Фудкост = (склад + мясо) ÷ выручка, причём только за дни, где выручка
 * известна: иначе закупки за весь месяц делились бы на выручку одного сданного отчёта.
 */
import { realCost, reportMismatch, type CanteenTotals } from './canteens';

export interface CostDay { cost: number; costed: number }
export interface CostInfo { cost: number; costed: number; byDay: Map<string, CostDay> }

export interface DayView {
  day: string;
  /** Со склада: по закупочным (руководитель) или по расходным (админ) */
  buy: number;
  meat: number;
  cash: number; card: number; revenue: number;
  hasRevenue: boolean;
  reported: boolean;
  source: 'iiko' | 'report' | null;
  /** Отчёт админа минус iiko, если расходятся заметно */
  mismatch: number | null;
  checks: number;
}

export interface PointView {
  id: string;
  name: string;
  buy: number; meat: number; cash: number; card: number; revenue: number;
  /** Фудкост за дни с выручкой */
  foodcost: number | null;
  /** За сколько дней посчитан фудкост */
  fcDays: number;
  reports: number;
  byDay: Map<string, DayView>;
}

export interface TotalView { buy: number; meat: number; cash: number; card: number; revenue: number; foodcost: number | null; fcDays: number }

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Склад за день по закупочным: строки без известной закупки оцениваются как «по расходной ÷ 1,1». */
function dayBuy(shipped: number, cost: CostDay | undefined, byCost: boolean): number {
  if (!byCost || shipped === 0) return shipped;
  return realCost(shipped, cost?.costed ?? 0, cost?.cost ?? 0);
}

export function buildViews(canteens: { id: string; name: string }[], totals: Map<string, CanteenTotals>, costs: Map<string, CostInfo> | null): PointView[] {
  const byCost = !!costs && costs.size > 0;
  return canteens.map((c) => {
    const t = totals.get(c.id);
    const ci = costs?.get(c.id);
    const byDay = new Map<string, DayView>();
    let buy = 0, meat = 0, cash = 0, card = 0, revenue = 0, fcBuy = 0, fcRev = 0, fcDays = 0;
    for (const [day, x] of [...(t?.byDay ?? new Map())].sort(([a], [b]) => a.localeCompare(b))) {
      const v: DayView = {
        day, buy: r2(dayBuy(x.shipped, ci?.byDay.get(day), byCost)), meat: x.meat,
        cash: x.cash, card: x.card, revenue: x.revenue, hasRevenue: x.hasRevenue, reported: x.reported,
        source: x.source, mismatch: reportMismatch(x), checks: x.checks,
      };
      byDay.set(day, v);
      buy += v.buy; meat += v.meat; cash += v.cash; card += v.card; revenue += v.revenue;
      if (v.hasRevenue && v.revenue > 0) { fcBuy += v.buy + v.meat; fcRev += v.revenue; fcDays += 1; }
    }
    return {
      id: c.id, name: c.name,
      buy: r2(buy), meat: r2(meat), cash: r2(cash), card: r2(card), revenue: r2(revenue),
      foodcost: fcRev > 0 ? fcBuy / fcRev : null, fcDays, reports: t?.reports ?? 0, byDay,
    };
  });
}

/** Итог по точкам; фудкост — тоже только по дням с выручкой каждой точки */
export function totalView(points: PointView[]): TotalView {
  let buy = 0, meat = 0, cash = 0, card = 0, revenue = 0, fcBuy = 0, fcRev = 0, fcDays = 0;
  for (const p of points) {
    buy += p.buy; meat += p.meat; cash += p.cash; card += p.card; revenue += p.revenue;
    for (const d of p.byDay.values()) if (d.hasRevenue && d.revenue > 0) { fcBuy += d.buy + d.meat; fcRev += d.revenue; fcDays += 1; }
  }
  return { buy: r2(buy), meat: r2(meat), cash: r2(cash), card: r2(card), revenue: r2(revenue), foodcost: fcRev > 0 ? fcBuy / fcRev : null, fcDays };
}

/** 12,3% */
export const fcText = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);

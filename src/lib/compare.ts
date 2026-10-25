/**
 * Сравнение разных карточек товара по цене за кг / л / шт.
 * Чистые функции: работают и на сервере (пометка на доске), и в браузере (список в карточке товара).
 */
import { parseMeasure, type Base, type Measure } from './measure';
import { similarity, tokens } from './similar';

export interface MeasureOverride { base: Base | null; per_unit: number | null; disabled: boolean }

/** Фасовка с учётом ручной поправки руководителя. */
export function resolveMeasure(name: string, unit: string, o?: MeasureOverride | null): Measure | null {
  if (o?.disabled) return null;
  if (o?.base && o.per_unit && o.per_unit > 0) return { base: o.base, perUnit: Number(o.per_unit), source: 'manual' };
  return parseMeasure(name, unit);
}

export interface Comparable {
  id: string;
  name: string;
  measure?: Measure | null;
  /** Лучшая цена за единицу товара */
  bestPrice: number;
  bestSupplierId: string;
}

export interface Alternative<T> {
  item: T;
  score: number;
  perBase: number;
  /** Насколько дешевле (−) или дороже (+) за кг, доля от цены этого товара */
  diff: number;
}

/** На доске пометку ставим, только если названия почти одинаковые (отличаются фасовкой) */
export const BOARD_MIN_SCORE = 0.75;
/** В карточке товара показываем и менее похожие — решает человек */
export const PANEL_MIN_SCORE = 0.3;
/** Дешевле хотя бы на столько, чтобы стоило показывать */
export const CHEAPER_BY = 0.05;

export function makeIndex<T extends Comparable>(items: T[]) {
  const tk = new Map(items.map((i) => [i.id, tokens(i.name)]));
  return {
    alternatives(item: T, minScore = PANEL_MIN_SCORE, limit = 8): Alternative<T>[] {
      const m = item.measure;
      if (!m) return [];
      const own = item.bestPrice / m.perUnit;
      const t = tk.get(item.id)!;
      const out: Alternative<T>[] = [];
      for (const other of items) {
        if (other.id === item.id || !other.measure || other.measure.base !== m.base) continue;
        const score = similarity(t, tk.get(other.id)!);
        if (score < minScore) continue;
        const perBase = other.bestPrice / other.measure.perUnit;
        out.push({ item: other, score, perBase, diff: own > 0 ? (perBase - own) / own : 0 });
      }
      return out.sort((a, b) => a.perBase - b.perBase).slice(0, limit);
    },
  };
}

export interface CheaperAlt { itemId: string; name: string; supplierId: string; perBase: number; base: Base; diff: number }

/** Самая дешёвая за кг почти такая же карточка, если она заметно дешевле. */
export function cheaperAlternative<T extends Comparable>(item: T, index: ReturnType<typeof makeIndex<T>>): CheaperAlt | null {
  const best = index.alternatives(item, BOARD_MIN_SCORE, 1)[0];
  if (!best || best.diff > -CHEAPER_BY || !item.measure) return null;
  return { itemId: best.item.id, name: best.item.name, supplierId: best.item.bestSupplierId, perBase: best.perBase, base: item.measure.base, diff: best.diff };
}

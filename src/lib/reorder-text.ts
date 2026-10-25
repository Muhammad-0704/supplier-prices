import { longDate, plural } from './format';
import type { Suggestion } from './reorder';

const qf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
export const fmtQty = (q: number) => qf.format(Math.round(q * 10) / 10);

const days = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;

/** «берёте раз в ~6 дней по 10 шт · последний раз 7 дней назад» */
export function rhythmLine(s: Suggestion, unit: string): string {
  const r = s.rhythm;
  const every = `раз в ~${days(Math.round(r.intervalDays))} по ${fmtQty(r.typicalQty)} ${unit}`;
  const last = r.daysSince === 0 ? 'последний раз сегодня' : r.daysSince === 1 ? 'последний раз вчера' : `последний раз ${days(r.daysSince)} назад`;
  return `${every} · ${last}`;
}

/** «на складе ~4 шт (пересчёт 25 окт) · хватит на ~2 дня» */
export function countLine(s: Suggestion, unit: string): string | null {
  if (s.basis !== 'count' || s.estLeft == null || !s.countAt) return null;
  const left = s.daysLeft == null ? '' : s.daysLeft < 1 ? ' · заканчивается' : ` · хватит на ~${days(Math.floor(s.daysLeft))}`;
  return `на складе ~${fmtQty(s.estLeft)} ${unit} (пересчёт ${longDate(s.countAt)})${left}`;
}

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const TZ = 'Europe/Moscow';

export const num = (v: number) => nf.format(Math.round(v));
export const rub = (v: number) => `${num(v)} ₽`;

export function pct(v: number): string {
  const a = Math.abs(v * 100);
  return a < 1 ? '<1%' : `${a.toFixed(0)}%`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function parts(iso: string) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  return f;
}

/** 12.10 */
export function shortDate(iso: string): string {
  const p = parts(iso);
  return `${p.day}.${p.month}`;
}

/** 12 окт */
export function longDate(iso: string): string {
  const p = parts(iso);
  return `${Number(p.day)} ${MON[Number(p.month) - 1]}`;
}

/** 14:31 */
export function time(iso: string): string {
  const p = parts(iso);
  return `${p.hour}:${p.minute}`;
}

export function relDays(ago: number): string {
  if (ago <= 0) return 'сегодня';
  if (ago === 1) return 'вчера';
  return `${ago} дн. назад`;
}

export function syncLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Данных из 1С ещё нет';
  const day = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(t);
  const d = day(Date.parse(iso));
  const when = d === day(now) ? 'сегодня' : d === day(now - 86_400_000) ? 'вчера' : longDate(iso);
  return `Синхронизировано с 1С ${when} в ${time(iso)}`;
}

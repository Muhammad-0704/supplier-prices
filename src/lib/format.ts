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

/** Рубли с копейками для маленьких сумм: цена за штуку из упаковки в 2500 шт */
export function rubFine(v: number): string {
  if (Math.abs(v) >= 100) return rub(v);
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(v)} ₽`;
}

/**
 * Короткое название поставщика для заголовка колонки: без ООО/ИП и кавычек,
 * «ИП Недорезов Илья Игоревич» → «Недорезов И. И.». Полное название остаётся в подсказке.
 */
export function shortSupplier(name: string): string {
  const s = name.trim();
  const ip = s.match(/^ИП\s+([А-ЯЁA-Z][а-яёa-z-]+)\s+([А-ЯЁA-Z])[а-яёa-z]*\.?\s*(?:([А-ЯЁA-Z])[а-яёa-z]*\.?)?$/u);
  // Инициалы склеены неразрывным пробелом, чтобы не разъезжались по строкам
  if (ip) return `${ip[1]} ${ip[2]}.${ip[3] ? `\u00a0${ip[3]}.` : ''}`;
  const out = s
    .replace(/^(ООО|ОАО|ЗАО|ПАО|АО|ИП|ЧП|ТОО)\s+/u, '')
    .replace(/[«»"“”„]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return out || s;
}

const VOWELS = /[аеёиоуыэюяaeiouy]/i;
/**
 * Мягкие переносы в длинных словах для узких колонок: «Землянск-молоко».
 * Браузер переносит по ним, только если слово не влезает.
 */
export function softHyphens(text: string, maxLen = 10): string {
  const v = (c: string | undefined) => !!c && VOWELS.test(c);
  return text.replace(/[A-Za-zА-Яа-яЁё]{11,}/g, (w) => {
    let out = '', run = 0;
    for (let j = 0; j < w.length; j++) {
      // Перенос перед согласной, за которой идёт гласная (начало слога): «Землянск-молоко»
      const left = w.length - j;
      if (run >= 4 && left >= 4 && !v(w[j]) && v(w[j + 1]) && !/[ьъй]/i.test(w[j])) { out += '\u00ad'; run = 0; }
      else if (run >= maxLen && left >= 3) { out += '\u00ad'; run = 0; }
      out += w[j];
      run++;
    }
    return out;
  });
}

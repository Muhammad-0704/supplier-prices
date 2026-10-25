/**
 * Похожесть названий товаров: для сравнения цен за кг между разными карточками
 * и для сопоставления строк прайса поставщика с нашими товарами.
 */

const STOP = new Set([
  'в', 'с', 'и', 'для', 'по', 'из', 'на', 'без', 'под', 'от', 'до', 'или', 'со',
  'шт', 'кг', 'г', 'гр', 'л', 'мл', 'уп', 'упак', 'кор', 'ящ', 'рул', 'пач', 'бл', 'мм', 'см', 'мкм', 'м',
  'россия', 'рф', 'китай', 'беларусь', 'турция', 'иран', 'казахстан', 'узбекистан', 'армения', 'грузия',
  'ассортименте', 'ассорти', 'в/с', 'вс', 'пл', 'ж', 'б', 'пэт', 'ст', 'мягк',
]);

/** Основы слов без чисел, размеров и служебных слов. Первое слово — обычно главное («Сахар», «Масло»). */
export function tokens(name: string): string[] {
  const s = name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'“”„()[\]{}]/g, ' ')
    // Жирность и номера сохраняем как слова: 72% и 82%, №811 и №823 — разные товары
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, (_, v) => ` p${v.replace(',', '.')} `)
    .replace(/№\s*([a-zа-я]*\d+[a-zа-я\d]*)/g, (_, v) => ` n${v} `)
    .replace(/(^|[^a-zа-я\d])\d+(?:[.,]\d+)?[а-яa-z]*/g, '$1 ')
    .replace(/[^a-zа-я\d.\s-]/g, ' ');
  const out: string[] = [];
  for (const raw of s.split(/[\s-]+/)) {
    const w = raw.replace(/^\.+|\.+$/g, '');
    if (w.length < 2 || STOP.has(w) || /^\d/.test(w)) continue;
    const stem = w.length > 6 ? w.slice(0, 6) : w;
    if (!out.includes(stem)) out.push(stem);
  }
  return out;
}

/** 0…1: доля общих слов; главное слово должно совпадать, иначе 0. */
export function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  if (!b.includes(a[0]) && !a.includes(b[0])) return 0;
  const sb = new Set(b);
  const common = a.filter((t) => sb.has(t)).length;
  return common / (a.length + b.length - common);
}

export interface Candidate<T> { item: T; score: number }

/** Лучшие совпадения для названия среди товаров. */
export function bestMatches<T extends { tokens: string[] }>(name: string | string[], items: T[], limit = 3, min = 0.2): Candidate<T>[] {
  const t = Array.isArray(name) ? name : tokens(name);
  const out: Candidate<T>[] = [];
  for (const item of items) {
    const score = similarity(t, item.tokens);
    if (score >= min) out.push({ item, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

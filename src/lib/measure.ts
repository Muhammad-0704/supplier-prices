/**
 * Фасовка товара: сколько кг, литров или штук в одной единице 1С.
 * Нужна, чтобы сравнивать «Сахар 50 кг» и «Сахар 25 кг» по цене за кг.
 * Берётся из названия; руководитель может поправить вручную.
 */

export type Base = 'кг' | 'л' | 'шт';

export interface Measure {
  base: Base;
  /** Сколько base в одной единице товара */
  perUnit: number;
  /** auto — из названия, manual — указал руководитель, unit — единица уже кг или л */
  source: 'auto' | 'manual' | 'unit';
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
// Вес или объём: 185г, 0,32л, 10 кг, 3800мл. Не путаем с «мкм», «мм», «см».
const QTY_RE = new RegExp(`(?:^|[^\\dа-яё])${NUM}\\s*(кг|гр|г|мл|л)(?![а-яё])`, 'giu');
// Штук в упаковке или коробке: 24шт/кор, 1000шт/уп, 10рул/уп
const PER_PACK_RE = new RegExp(`${NUM}\\s*(?:шт|рул|пач[а-я]*|пак[а-я]*)\\s*/\\s*(?:кор|уп|ящ|рул|пач|бл)`, 'iu');
// Просто «100шт», «2500 шт»
const COUNT_RE = new RegExp(`(?:^|[^\\d/])${NUM}\\s*шт(?![а-яё])`, 'iu');

const toNum = (s: string) => Number(s.replace(',', '.'));
const PACK_UNITS = new Set(['кор', 'ящ', 'упак', 'уп', 'бл']);
const CAPACITY_HEADS = ['контейнер', 'стакан', 'банк', 'бутыл', 'ведро', 'кастрюл', 'дозатор', 'форма', 'крышк', 'салатник', 'соусник', 'пресс', 'емкост', 'бак', 'мешок', 'мешки', 'тарелк', 'блюдо', 'миска', 'ящик', 'кувшин', 'термос', 'чайник'];

function normUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u.startsWith('л')) return 'л';
  if (u.startsWith('кг') || u === 'килограмм') return 'кг';
  return u;
}

/** Фасовка из названия и единицы. null — понять нельзя. */
export function parseMeasure(name: string, unit: string): Measure | null {
  const u = normUnit(unit);
  if (u === 'кг') return { base: 'кг', perUnit: 1, source: 'unit' };
  if (u === 'л') return { base: 'л', perUnit: 1, source: 'unit' };
  if (u === 'г') return { base: 'кг', perUnit: 0.001, source: 'unit' };

  const n = name.toLowerCase().replace(/ё/g, 'е');
  // Объём тары — вместимость, а не содержимое: «Контейнер 750мл», «Ведро 15л», «Мешки для мусора 240л»
  const head = n.replace(/[^а-яa-z\s-]/g, ' ').trim().split(/[\s-]+/)[0] ?? '';
  if (CAPACITY_HEADS.some((h) => head.startsWith(h)) || /мешк[а-я]* для мусора|мусорн/.test(n)) return null;

  const qty = [...n.matchAll(QTY_RE)][0];
  const packM = n.match(PER_PACK_RE);
  const perPack = packM ? toNum(packM[1]) : 0;

  if (qty) {
    const v = toNum(qty[1]);
    if (!(v > 0)) return null;
    const m = qty[2];
    const base: Base = m === 'л' || m === 'мл' ? 'л' : 'кг';
    let per = m === 'г' || m === 'гр' || m === 'мл' ? v / 1000 : v;
    // «82,5г, 24шт/кор» при единице «кор» — в коробке 24 × 82,5 г
    if (PACK_UNITS.has(u) && perPack > 1 && !/кг\s*\/\s*(кор|ящ|уп)/.test(n)) per *= perPack;
    return { base, perUnit: Math.round(per * 1e6) / 1e6, source: 'auto' };
  }

  // Без веса: сравниваем по штукам в упаковке
  if (perPack > 1 && PACK_UNITS.has(u)) return { base: 'шт', perUnit: perPack, source: 'auto' };
  const cnt = n.match(COUNT_RE);
  if (cnt && toNum(cnt[1]) > 1) return { base: 'шт', perUnit: toNum(cnt[1]), source: 'auto' };
  return null;
}

/** Цена за кг / л / шт. */
export function perBasePrice(price: number, m: Measure | null): number | null {
  return m && m.perUnit > 0 ? price / m.perUnit : null;
}

export function baseLabel(b: Base): string {
  return b === 'шт' ? 'шт' : b;
}

/** «1 шт = 0,185 кг» */
export function measureText(m: Measure, unit: string): string {
  const f = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(m.perUnit);
  return `1 ${unit} = ${f} ${m.base}`;
}

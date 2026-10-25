/**
 * Прайс поставщика из файла: найти колонки «название» и «цена», вытащить строки,
 * сопоставить с нашими товарами и пересчитать цену на нашу фасовку.
 * Чистые функции, работают в браузере.
 */
import { parseMeasure, type Measure } from './measure';
import { bestMatches, tokens } from './similar';

export type Cell = string | number | boolean | Date | null | undefined;
export type Grid = Cell[][];

export interface Columns { header: number; name: number; price: number; unit: number | null }

export interface PriceRow { line: number; name: string; price: number; unit: string | null }

const text = (c: Cell) => (c == null ? '' : c instanceof Date ? '' : String(c).trim());

/** «1 250,50 ₽», «1250.5», 1250.5 → 1250.5. Не число — null. */
export function parsePrice(c: Cell): number | null {
  if (typeof c === 'number') return Number.isFinite(c) && c > 0 ? c : null;
  const s = text(c).replace(/\s| /g, '').replace(/(руб\.?|р\.?|₽)$/i, '');
  if (!/^\d+([.,]\d+)?$/.test(s)) return null;
  const v = Number(s.replace(',', '.'));
  return v > 0 ? v : null;
}

const NAME_HEAD = /наимен|название|товар|продукц|номенклат|позиц|описан|name|product/i;
const PRICE_HEAD = /цена|стоим|руб|прайс|price|опт/i;
const UNIT_HEAD = /^(ед|ед\.|единиц|ед\.? ?изм|фасовк|упак|unit)/i;

/** Угадывает строку заголовка и колонки. Если не уверены — колонки с самым длинным текстом и с числами. */
export function guessColumns(grid: Grid): Columns | null {
  const rows = grid.slice(0, 400);
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (!width || !rows.length) return null;

  // Заголовок: первая строка в первых 30, где есть и «название», и «цена»
  let header = -1, name = -1, price = -1, unit: number | null = null;
  for (let r = 0; r < Math.min(30, rows.length) && header < 0; r++) {
    const cells = rows[r].map(text);
    const n = cells.findIndex((c) => NAME_HEAD.test(c));
    // Цен бывает несколько (опт, розница): берём первую
    const p = cells.findIndex((c, i) => i !== n && PRICE_HEAD.test(c) && !/без ндс|ндс,? ?%|сумма/i.test(c));
    if (n >= 0 && p >= 0) {
      header = r; name = n; price = p;
      const u = cells.findIndex((c, i) => i !== n && i !== p && UNIT_HEAD.test(c));
      unit = u >= 0 ? u : null;
    }
  }

  const body = rows.slice(header + 1);
  if (header < 0) {
    // Без заголовка: цена — колонка, где чаще всего числа; название — где длиннее всего текст
    const numScore = Array.from({ length: width }, (_, i) => body.filter((r) => parsePrice(r[i]) != null).length);
    const txtScore = Array.from({ length: width }, (_, i) => body.reduce((s, r) => s + (parsePrice(r[i]) == null ? text(r[i]).length : 0), 0));
    name = txtScore.indexOf(Math.max(...txtScore));
    const cand = numScore.map((v, i) => (i === name ? -1 : v));
    price = cand.indexOf(Math.max(...cand));
    if (name < 0 || price < 0 || numScore[price] === 0) return null;
  }
  return { header, name, price, unit };
}

/** Строки с названием и положительной ценой; разделы и пустые строки пропускаются. */
export function extractRows(grid: Grid, cols: Columns, limit = 3000): PriceRow[] {
  const out: PriceRow[] = [];
  for (let r = cols.header + 1; r < grid.length && out.length < limit; r++) {
    const row = grid[r] ?? [];
    const name = text(row[cols.name]).replace(/\s+/g, ' ');
    const price = parsePrice(row[cols.price]);
    if (name.length < 2 || price == null || parsePrice(name) != null) continue;
    const unit = cols.unit != null ? text(row[cols.unit]) || null : null;
    out.push({ line: r + 1, name: name.slice(0, 300), price: Math.round(price * 100) / 100, unit: unit?.slice(0, 20) ?? null });
  }
  return out;
}

/** CSV из Excel или 1С: разделитель «;», «,» или табуляция, кавычки. */
export function parseCsv(src: string): Grid {
  const s = src.replace(/^﻿/, '');
  const first = s.split(/\r?\n/, 1)[0] ?? '';
  const delim = [';', '\t', ','].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: Grid = [];
  let row: Cell[] = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export interface OurItem {
  id: string;
  name: string;
  unit: string;
  bestPrice: number;
  bestSupplierId: string;
  measure: Measure | null;
}

export interface Matched {
  row: PriceRow;
  /** Кандидаты из наших товаров, лучший первый */
  candidates: { id: string; score: number }[];
  /** Выбранный товар (авто, если совпадение уверенное) */
  itemId: string | null;
}

/** Совпадение считаем уверенным от этой похожести */
export const AUTO_MATCH = 0.5;

export function matchRows(rows: PriceRow[], items: OurItem[]): Matched[] {
  const idx = items.map((i) => ({ id: i.id, tokens: tokens(i.name) }));
  return rows.map((row) => {
    const c = bestMatches(row.name, idx, 4, 0.25).map((x) => ({ id: x.item.id, score: x.score }));
    return { row, candidates: c, itemId: c[0] && c[0].score >= AUTO_MATCH ? c[0].id : null };
  });
}

export interface Compared {
  /** Цена поставщика за нашу единицу (пересчитана, если фасовки разные) */
  price: number;
  converted: boolean;
  /** Разница с нашей лучшей ценой, доля */
  diff: number | null;
  their: Measure | null;
}

/** Пересчёт цены поставщика на нашу фасовку: их «Сахар 25 кг» к нашему «Сахар 50 кг». */
export function compareToItem(row: PriceRow, item: OurItem): Compared {
  const their = parseMeasure(row.name, row.unit || 'шт');
  const ours = item.measure;
  let price = row.price;
  let converted = false;
  if (their && ours && their.base === ours.base && Math.abs(their.perUnit - ours.perUnit) > 1e-9) {
    price = Math.round((row.price / their.perUnit) * ours.perUnit * 100) / 100;
    converted = true;
  }
  return { price, converted, diff: item.bestPrice > 0 ? (price - item.bestPrice) / item.bestPrice : null, their };
}

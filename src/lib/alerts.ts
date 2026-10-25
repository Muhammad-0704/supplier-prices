/**
 * Сигналы о ценах. Чистые функции (без базы), чтобы их можно было проверить тестами.
 *
 * up       — поставщик поднял цену на N%+ к своей прошлой закупке этого товара
 * down     — поставщик привёз на N%+ дешевле своей прошлой цены
 * cheapest — привёз на N%+ дешевле лучшей актуальной цены у других поставщиков
 */
export type AlertKind = 'up' | 'down' | 'cheapest';

export interface PriceRow {
  onec_doc_ref: string;
  line_no: number;
  doc_number?: string | null;
  doc_date: string;
  item_id: string;
  supplier_id: string;
  price: number;
}

export interface Alert {
  kind: AlertKind;
  line: PriceRow;
  refPrice: number;
  refSupplierId: string | null;
  change: number;
}

export interface Thresholds { up: number; down: number }
export const DEFAULT_THRESHOLDS: Thresholds = { up: 0.10, down: 0.10 };

const DAY = 86_400_000;
/** Цена другого поставщика считается актуальной, если ей не больше 60 дней на момент закупки */
const FRESH_DAYS = 60;

/**
 * @param fresh   новые строки накладных, по которым нужны сигналы
 * @param history все закупки тех же товаров (можно вместе с новыми строками — они исключаются сами)
 */
export function detectAlerts(fresh: PriceRow[], history: PriceRow[], t: Thresholds = DEFAULT_THRESHOLDS): Alert[] {
  const byItem = new Map<string, PriceRow[]>();
  for (const h of history) byItem.set(h.item_id, [...(byItem.get(h.item_id) ?? []), h]);
  const out: Alert[] = [];

  for (const line of fresh) {
    const at = Date.parse(line.doc_date);
    const before = (byItem.get(line.item_id) ?? []).filter((h) => h.onec_doc_ref !== line.onec_doc_ref && Date.parse(h.doc_date) <= at);

    // Прошлая цена этого же поставщика
    const own = before.filter((h) => h.supplier_id === line.supplier_id).sort((a, b) => Date.parse(b.doc_date) - Date.parse(a.doc_date))[0];
    if (own && own.price > 0) {
      const change = (line.price - own.price) / own.price;
      if (change >= t.up - 1e-9) out.push({ kind: 'up', line, refPrice: own.price, refSupplierId: line.supplier_id, change });
      else if (change <= -t.down + 1e-9) out.push({ kind: 'down', line, refPrice: own.price, refSupplierId: line.supplier_id, change });
    }

    // Лучшая актуальная цена у других поставщиков на момент закупки
    const latestOther = new Map<string, PriceRow>();
    for (const h of before) {
      if (h.supplier_id === line.supplier_id || at - Date.parse(h.doc_date) > FRESH_DAYS * DAY) continue;
      const cur = latestOther.get(h.supplier_id);
      if (!cur || Date.parse(h.doc_date) > Date.parse(cur.doc_date)) latestOther.set(h.supplier_id, h);
    }
    const best = [...latestOther.values()].sort((a, b) => a.price - b.price)[0];
    if (best && best.price > 0) {
      const change = (line.price - best.price) / best.price;
      if (change <= -t.down + 1e-9) out.push({ kind: 'cheapest', line, refPrice: best.price, refSupplierId: best.supplier_id, change });
    }
  }
  return out;
}

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const pct = (c: number) => `${c > 0 ? '+' : '−'}${Math.round(Math.abs(c) * 100)}%`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Одно сообщение на синхронизацию: сначала подорожания, потом удачные цены. */
export function formatAlerts(alerts: Alert[], names: { item: (id: string) => string; supplier: (id: string) => string }, siteUrl?: string): string | null {
  if (!alerts.length) return null;
  const up = alerts.filter((a) => a.kind === 'up').sort((a, b) => b.change - a.change);
  // Если строка дала и «дешевле прошлой цены», и «дешевле всех» — оставляем второе, оно важнее
  const cheapestKeys = new Set(alerts.filter((a) => a.kind === 'cheapest').map((a) => `${a.line.onec_doc_ref}:${a.line.line_no}`));
  const good = alerts.filter((a) => a.kind === 'cheapest' || (a.kind === 'down' && !cheapestKeys.has(`${a.line.onec_doc_ref}:${a.line.line_no}`))).sort((a, b) => a.change - b.change);
  const lines: string[] = [];
  if (up.length) {
    lines.push(`🔺 <b>Подорожало</b> (${up.length})`);
    up.slice(0, 10).forEach((a) => lines.push(`• ${esc(names.item(a.line.item_id))} — ${esc(names.supplier(a.line.supplier_id))}: ${nf.format(a.refPrice)} → <b>${nf.format(a.line.price)} ₽</b> (${pct(a.change)})`));
    if (up.length > 10) lines.push(`…и ещё ${up.length - 10}`);
  }
  if (good.length) {
    if (lines.length) lines.push('');
    lines.push(`🟢 <b>Привезли дешевле</b> (${good.length})`);
    good.slice(0, 10).forEach((a) => {
      const vs = a.kind === 'cheapest' ? `дешевле, чем у ${esc(names.supplier(a.refSupplierId ?? ''))} (${nf.format(a.refPrice)} ₽)` : `было ${nf.format(a.refPrice)} ₽`;
      lines.push(`• ${esc(names.item(a.line.item_id))} — ${esc(names.supplier(a.line.supplier_id))}: <b>${nf.format(a.line.price)} ₽</b>, ${vs} (${pct(a.change)})`);
    });
    if (good.length > 10) lines.push(`…и ещё ${good.length - 10}`);
  }
  if (siteUrl) lines.push('', siteUrl);
  return lines.join('\n');
}

export interface QtyRow extends PriceRow { qty: number }
export interface Overpay { line: QtyRow; best: number; bestSupplierId: string; amount: number }

/**
 * Где переплатили: закупка дороже лучшей актуальной цены другого поставщика на тот момент.
 * amount = (цена − лучшая) × количество.
 */
export function findOverpays(lines: QtyRow[], history: PriceRow[]): Overpay[] {
  const byItem = new Map<string, PriceRow[]>();
  for (const h of history) byItem.set(h.item_id, [...(byItem.get(h.item_id) ?? []), h]);
  const out: Overpay[] = [];
  for (const line of lines) {
    const at = Date.parse(line.doc_date);
    const latest = new Map<string, PriceRow>();
    for (const h of byItem.get(line.item_id) ?? []) {
      const t = Date.parse(h.doc_date);
      if (h.supplier_id === line.supplier_id || h.onec_doc_ref === line.onec_doc_ref || t > at || at - t > FRESH_DAYS * DAY) continue;
      const cur = latest.get(h.supplier_id);
      if (!cur || t > Date.parse(cur.doc_date)) latest.set(h.supplier_id, h);
    }
    const best = [...latest.values()].sort((a, b) => a.price - b.price)[0];
    if (best && line.price > best.price) {
      const amount = Math.round((line.price - best.price) * line.qty);
      if (amount > 0) out.push({ line, best: best.price, bestSupplierId: best.supplier_id, amount });
    }
  }
  return out.sort((a, b) => b.amount - a.amount);
}

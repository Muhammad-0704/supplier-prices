import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findOverpays, type PriceRow, type QtyRow } from './alerts';
import { SITE_URL } from './alert-runner';
import { ourBestPrices } from './offers';
import { esc } from './telegram';

const DAY = 86_400_000;
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const rub = (v: number) => `${nf.format(Math.round(v))} ₽`;
const isReceipt = (op: string | null) => !op || op === 'ПоступлениеОтПоставщика';
const dm = (t: number) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' }).format(t);

type P = QtyRow & { operation: string | null };

async function purchasesBetween(db: SupabaseClient, from: number, to: number): Promise<P[]> {
  const out: P[] = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await db.from('purchases').select('onec_doc_ref, line_no, doc_number, doc_date, item_id, supplier_id, price, qty, operation')
      .gte('doc_date', new Date(from).toISOString()).lt('doc_date', new Date(to).toISOString()).range(f, f + 999);
    (data ?? []).forEach((r) => out.push({ ...r, price: Number(r.price), qty: Number(r.qty) }));
    if (!data || data.length < 1000) break;
  }
  return out.filter((r) => isReceipt(r.operation));
}

const sum = (rows: QtyRow[]) => rows.reduce((s, r) => s + r.price * r.qty, 0);
const docs = (rows: QtyRow[]) => new Set(rows.map((r) => r.onec_doc_ref)).size;
const delta = (cur: number, prev: number) => (prev > 0 ? ` (${cur >= prev ? '+' : '−'}${Math.round(Math.abs(cur - prev) / prev * 100)}% к прошлой)` : '');

/** Сводка за последние 7 дней в HTML для Telegram. */
export async function buildWeeklySummary(db: SupabaseClient, now = Date.now()): Promise<string> {
  const weekAgo = now - 7 * DAY;
  const [cur, prev, hist] = await Promise.all([
    purchasesBetween(db, weekAgo, now),
    purchasesBetween(db, now - 14 * DAY, weekAgo),
    purchasesBetween(db, now - 70 * DAY, now),
  ]);

  const [{ data: alerts }, { data: subs }] = await Promise.all([
    db.from('price_alerts').select('kind, item_id, supplier_id, price, ref_price, change').gte('created_at', new Date(weekAgo).toISOString()),
    db.from('offer_submissions').select('id, link_id').gte('created_at', new Date(weekAgo).toISOString()),
  ]);
  const subIds = (subs ?? []).map((s) => s.id);
  const { data: offerLines } = subIds.length ? await db.from('offer_lines').select('item_id, price, link_id').in('submission_id', subIds) : { data: [] as { item_id: string | null; price: number; link_id: string }[] };

  const overpays = findOverpays(cur, hist as PriceRow[]);
  const overTotal = overpays.reduce((s, o) => s + o.amount, 0);

  // Названия
  const itemIds = new Set<string>([...overpays.slice(0, 5).map((o) => o.line.item_id), ...(alerts ?? []).map((a) => a.item_id)]);
  const supIds = new Set<string>([...cur.map((r) => r.supplier_id), ...overpays.slice(0, 5).map((o) => o.bestSupplierId), ...(alerts ?? []).map((a) => a.supplier_id)]);
  const [{ data: items }, { data: sups }] = await Promise.all([
    itemIds.size ? db.from('items').select('id, name').in('id', [...itemIds]) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supIds.size ? db.from('suppliers').select('id, name').in('id', [...supIds]) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const iName = (id: string) => esc(items?.find((i) => i.id === id)?.name ?? 'товар');
  const sName = (id: string) => esc(sups?.find((s) => s.id === id)?.name ?? 'поставщик');

  const L: string[] = [];
  L.push(`📊 <b>Сводка за неделю</b> · ${dm(weekAgo)} — ${dm(now - 1)}`);
  L.push('');
  L.push(`<b>Закупки:</b> ${rub(sum(cur))}${delta(sum(cur), sum(prev))}`);
  L.push(`Накладных: ${docs(cur)}, позиций: ${cur.length}`);

  // Топ поставщиков недели
  const bySup = new Map<string, number>();
  cur.forEach((r) => bySup.set(r.supplier_id, (bySup.get(r.supplier_id) ?? 0) + r.price * r.qty));
  const topSup = [...bySup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topSup.length) {
    L.push('', '<b>Больше всего закупили у:</b>');
    topSup.forEach(([id, v], i) => L.push(`${i + 1}. ${sName(id)} — ${rub(v)}`));
  }

  const up = (alerts ?? []).filter((a) => a.kind === 'up').sort((a, b) => Number(b.change) - Number(a.change));
  const good = (alerts ?? []).filter((a) => a.kind !== 'up').sort((a, b) => Number(a.change) - Number(b.change));
  L.push('', `🔺 <b>Подорожало на 10%+:</b> ${up.length}`);
  up.slice(0, 5).forEach((a) => L.push(`• ${iName(a.item_id)} — ${sName(a.supplier_id)}: ${nf.format(Number(a.ref_price))} → ${nf.format(Number(a.price))} ₽ (+${Math.round(Number(a.change) * 100)}%)`));
  L.push(`🟢 <b>Привезли дешевле на 10%+:</b> ${new Set(good.map((a) => `${a.item_id}:${a.supplier_id}`)).size}`);
  const seen = new Set<string>();
  good.filter((a) => { const k = `${a.item_id}:${a.supplier_id}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 5).forEach((a) => L.push(`• ${iName(a.item_id)} — ${sName(a.supplier_id)}: ${nf.format(Number(a.price))} ₽ (−${Math.round(Math.abs(Number(a.change)) * 100)}%)`));

  L.push('', `💸 <b>Можно было сэкономить:</b> ${rub(overTotal)}`);
  if (overpays.length) {
    L.push('Если бы брали у того, кто был дешевле:');
    overpays.slice(0, 5).forEach((o) => L.push(`• ${iName(o.line.item_id)}: брали у ${sName(o.line.supplier_id)} по ${nf.format(o.line.price)} ₽, у ${sName(o.bestSupplierId)} было ${nf.format(o.best)} ₽ — ${rub(o.amount)}`));
  } else {
    L.push('Всё брали по лучшим ценам 👍');
  }

  const ol = (offerLines ?? []).filter((l) => l.item_id);
  if (subIds.length) {
    const best = await ourBestPrices(db, [...new Set(ol.map((l) => l.item_id!))]);
    const cheaper = ol.filter((l) => best.get(l.item_id!) && Number(l.price) < best.get(l.item_id!)!).length;
    L.push('', `📨 <b>Предложения поставщиков:</b> ${subIds.length} от ${new Set((subs ?? []).map((s) => s.link_id)).size} фирм, дешевле наших цен: ${cheaper}`);
  }

  L.push('', SITE_URL);
  return L.join('\n');
}

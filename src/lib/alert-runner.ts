import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_THRESHOLDS, detectAlerts, formatAlerts, type PriceRow, type Thresholds } from './alerts';
import { notify } from './telegram';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://pricedoska.vercel.app';
/** Сигналы только по свежим закупкам: правки старых накладных не должны будить ночью */
const FRESH_DAYS = 3;

const isReceipt = (op: string | null | undefined) => !op || op === 'ПоступлениеОтПоставщика';

export async function loadThresholds(db: SupabaseClient): Promise<Thresholds> {
  const { data } = await db.from('app_settings').select('key, value').in('key', ['alert_up_pct', 'alert_down_pct']);
  const get = (k: string, d: number) => {
    const v = Number(data?.find((r) => r.key === k)?.value);
    return Number.isFinite(v) && v > 0 && v < 100 ? v / 100 : d;
  };
  return { up: get('alert_up_pct', DEFAULT_THRESHOLDS.up), down: get('alert_down_pct', DEFAULT_THRESHOLDS.down) };
}

/**
 * Проверяет новые строки накладных, записывает сигналы в журнал (без повторов) и шлёт одно сообщение в Telegram.
 * Ошибки здесь не роняют синхронизацию.
 */
export async function runAlerts(db: SupabaseClient, newRows: (PriceRow & { operation?: string | null })[]): Promise<number> {
  try {
    const since = Date.now() - FRESH_DAYS * 86_400_000;
    const fresh = newRows.filter((r) => isReceipt(r.operation) && Date.parse(r.doc_date) >= since);
    if (!fresh.length) return 0;

    const itemIds = [...new Set(fresh.map((r) => r.item_id))];
    const from = new Date(Date.now() - 150 * 86_400_000).toISOString();
    const history: PriceRow[] = [];
    for (let i = 0; i < itemIds.length; i += 200) {
      const { data } = await db.from('purchases').select('onec_doc_ref, line_no, doc_date, item_id, supplier_id, price, operation')
        .in('item_id', itemIds.slice(i, i + 200)).gte('doc_date', from).range(0, 9999);
      (data ?? []).filter((r) => isReceipt(r.operation)).forEach((r) => history.push({ ...r, price: Number(r.price) }));
    }

    const alerts = detectAlerts(fresh, history, await loadThresholds(db));
    if (!alerts.length) return 0;

    const { data: inserted } = await db.from('price_alerts').upsert(alerts.map((a) => ({
      kind: a.kind, onec_doc_ref: a.line.onec_doc_ref, line_no: a.line.line_no, doc_number: a.line.doc_number ?? null, doc_date: a.line.doc_date,
      item_id: a.line.item_id, supplier_id: a.line.supplier_id, price: a.line.price, ref_price: a.refPrice, ref_supplier_id: a.refSupplierId,
      change: Math.round(a.change * 10000) / 10000,
    })), { onConflict: 'onec_doc_ref,line_no,kind', ignoreDuplicates: true }).select('onec_doc_ref, line_no, kind');

    const sent = new Set((inserted ?? []).map((r) => `${r.onec_doc_ref}:${r.line_no}:${r.kind}`));
    const toSend = alerts.filter((a) => sent.has(`${a.line.onec_doc_ref}:${a.line.line_no}:${a.kind}`));
    if (!toSend.length) return 0;

    const supIds = [...new Set(toSend.flatMap((a) => [a.line.supplier_id, a.refSupplierId].filter(Boolean) as string[]))];
    const [{ data: items }, { data: sups }] = await Promise.all([
      db.from('items').select('id, name').in('id', [...new Set(toSend.map((a) => a.line.item_id))]),
      db.from('suppliers').select('id, name').in('id', supIds),
    ]);
    const itemName = new Map((items ?? []).map((i) => [i.id, i.name]));
    const supName = new Map((sups ?? []).map((s) => [s.id, s.name]));
    const text = formatAlerts(toSend, { item: (id) => itemName.get(id) ?? 'товар', supplier: (id) => supName.get(id) ?? 'поставщик' }, SITE_URL);
    if (text) await notify(db, text);
    return toSend.length;
  } catch (e) {
    console.log('[alerts]', (e as Error).message);
    return 0;
  }
}

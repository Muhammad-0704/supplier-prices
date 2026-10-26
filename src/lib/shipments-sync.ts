import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ONEC, PRICE_SETTING_LINES_ENTITY, SELECT, SHIPMENT_LINES_ENTITY } from './onec/config';
import { mapPriceSettings, mapShipments, postedRefs, postedShipmentRefs } from './onec/map';
import { odataDate, ODataError, type ODataClient, type ODataRow } from './onec/odata';

export interface ShipmentsResult { ok: boolean; docs: number; lines: number; message: string; partial?: boolean }

const OVERLAP_DAYS = 7;
/** Сколько секунд из общего лимита функции можно потратить на расходные: остаток догрузится в следующий раз */
const BUDGET_MS = 150_000;

async function since(db: SupabaseClient): Promise<Date> {
  const days = Number(process.env.SHIPMENTS_DAYS_BACK || 62);
  const full = new Date(Date.now() - days * 86_400_000);
  // Строки, загруженные до появления «вида цены», перечитываем за весь период один раз
  const { count } = await db.from('shipments').select('id', { count: 'exact', head: true }).is('price_type_ref', null).gte('doc_date', full.toISOString());
  if (count) return full;
  const { data } = await db.from('shipments').select('doc_date').order('doc_date', { ascending: false }).limit(1);
  if (data?.[0]?.doc_date) return new Date(Date.parse(data[0].doc_date) - OVERLAP_DAYS * 86_400_000);
  return full;
}

async function loadMaps(db: SupabaseClient) {
  const items = new Map<string, { id: string; name: string; unit: string; category: string }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('items').select('id, onec_ref, name, unit, category').range(from, from + 999);
    if (error) throw new Error(`Чтение items: ${error.message}`);
    for (const r of data ?? []) if (r.onec_ref) items.set(r.onec_ref, r);
    if (!data || data.length < 1000) break;
  }
  const customers = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('suppliers').select('id, onec_ref').range(from, from + 999);
    if (error) throw new Error(`Чтение suppliers: ${error.message}`);
    for (const r of data ?? []) if (r.onec_ref) customers.set(r.onec_ref, r.id);
    if (!data || data.length < 1000) break;
  }
  return { items, customers };
}

async function saveState(db: SupabaseClient, ok: boolean, message: string, key = 'shipments') {
  await db.from('sync_state').upsert({ key, at: new Date().toISOString(), ok, message });
}

/**
 * Расходные накладные склада → таблица shipments. Справочники уже обновлены основной синхронизацией.
 * Документы идут по дате порциями: если время вышло, записанное сохраняется, остальное — в следующий запуск.
 */
export async function runShipmentsSync(db: SupabaseClient, onec: ODataClient): Promise<ShipmentsResult> {
  const t0 = Date.now();
  try {
    const from = await since(db);
    const raw = await onec.list(ONEC.shipments.entity, { filter: `Date ge ${odataDate(from)}`, select: SELECT.shipments, pageSize: 60 });
    raw.sort((a, b) => String(a.Date).localeCompare(String(b.Date)));
    const { items, customers } = await loadMaps(db);

    let docs = 0, written = 0, skipped = 0, partial = false;
    for (let i = 0; i < raw.length; i += 45) {
      if (Date.now() - t0 > BUDGET_MS) { partial = true; break; }
      const chunk = raw.slice(i, i + 45);
      const refs = postedShipmentRefs(chunk);
      const lines: ODataRow[] = [];
      for (let j = 0; j < refs.length; j += 45) {
        const part = await Promise.all([0, 15, 30].map((k) => refs.slice(j + k, j + k + 15)).filter((b) => b.length).map((b) =>
          onec.list(SHIPMENT_LINES_ENTITY, { filter: b.map((r) => `Ref_Key eq guid'${r}'`).join(' or '), select: SELECT.shipmentLines, pageSize: 60, orderby: 'Ref_Key,LineNumber' })));
        part.forEach((p) => lines.push(...p));
      }
      const mapped = mapShipments(chunk, lines);
      const rows = mapped.lines.flatMap((l) => {
        const customer_id = customers.get(l.customer_ref);
        const it = items.get(l.item_ref);
        if (!customer_id || !it) { skipped++; return []; }
        return [{
          onec_doc_ref: l.onec_doc_ref, line_no: l.line_no, doc_number: l.doc_number, doc_date: l.doc_date, customer_id,
          item_id: it.id, item_name: it.name, item_unit: it.unit, item_category: it.category,
          qty: l.qty, price: l.price, amount: l.amount, operation: l.operation, price_type_ref: l.price_type_ref,
        }];
      });
      for (let k = 0; k < mapped.docRefs.length; k += 200) {
        const { error } = await db.from('shipments').delete().in('onec_doc_ref', mapped.docRefs.slice(k, k + 200));
        if (error) throw new Error(`Очистка расходных: ${error.message}`);
      }
      for (let k = 0; k < rows.length; k += 500) {
        const { error } = await db.from('shipments').insert(rows.slice(k, k + 500));
        if (error) throw new Error(`Запись расходных: ${error.message}`);
      }
      docs += mapped.docRefs.length;
      written += rows.length;
    }
    const message = `Расходных: ${docs}, строк: ${written}` + (skipped ? `, пропущено без товара или покупателя: ${skipped}` : '') + (partial ? ', остальное догрузится в следующий раз' : '');
    await saveState(db, true, message);
    console.log(`[shipments] ${((Date.now() - t0) / 1000).toFixed(1)}s ${message}`);
    return { ok: true, docs, lines: written, message, partial };
  } catch (e) {
    const err = e as Error;
    const message = err instanceof ODataError && err.status === 404
      ? 'Расходные накладные не открыты в OData: отметьте документ «Расходная накладная» в настройке стандартного интерфейса OData в 1С.'
      : err.message || 'Неизвестная ошибка';
    await saveState(db, false, message);
    return { ok: false, docs: 0, lines: 0, message };
  }
}

/**
 * «Установка цен номенклатуры» → price_settings: продажные цены склада по датам. Нужны, чтобы проверить,
 * что расходная выписана по установленной цене, а установленная цена — это последняя закупка + 10%.
 */
export async function runPriceSettingsSync(db: SupabaseClient, onec: ODataClient): Promise<ShipmentsResult> {
  const t0 = Date.now();
  try {
    const { data: last } = await db.from('price_settings').select('set_at').order('set_at', { ascending: false }).limit(1);
    const days = Number(process.env.PRICE_SETTINGS_DAYS_BACK || 180);
    const from = last?.[0]?.set_at ? new Date(Date.parse(last[0].set_at) - OVERLAP_DAYS * 86_400_000) : new Date(Date.now() - days * 86_400_000);
    const raw = await onec.list(ONEC.priceSettings.entity, { filter: `Date ge ${odataDate(from)}`, select: SELECT.priceSettings, pageSize: 60 });
    raw.sort((a, b) => String(a.Date).localeCompare(String(b.Date)));
    const { items } = await loadMaps(db);

    let docs = 0, written = 0, partial = false;
    for (let i = 0; i < raw.length; i += 15) {
      if (Date.now() - t0 > 60_000) { partial = true; break; }
      const chunk = raw.slice(i, i + 15);
      const refs = postedRefs(chunk);
      // В одной установке цен бывают сотни строк: по 5 документов в запросе
      const lines: ODataRow[] = [];
      for (let j = 0; j < refs.length; j += 15) {
        const part = await Promise.all([0, 5, 10].map((k) => refs.slice(j + k, j + k + 5)).filter((b) => b.length).map((b) =>
          onec.list(PRICE_SETTING_LINES_ENTITY, { filter: b.map((r) => `Ref_Key eq guid'${r}'`).join(' or '), select: SELECT.priceSettingLines, pageSize: 60, orderby: 'Ref_Key,LineNumber' })));
        part.forEach((p) => lines.push(...p));
      }
      const mapped = mapPriceSettings(chunk, lines);
      const rows = mapped.lines.flatMap((l) => {
        const it = items.get(l.item_ref);
        return it ? [{ onec_doc_ref: l.onec_doc_ref, line_no: l.line_no, set_at: l.set_at, item_id: it.id, price_type_ref: l.price_type_ref, price: l.price, old_price: l.old_price }] : [];
      });
      for (let k = 0; k < mapped.docRefs.length; k += 200) {
        const { error } = await db.from('price_settings').delete().in('onec_doc_ref', mapped.docRefs.slice(k, k + 200));
        if (error) throw new Error(`Очистка установки цен: ${error.message}`);
      }
      for (let k = 0; k < rows.length; k += 500) {
        const { error } = await db.from('price_settings').insert(rows.slice(k, k + 500));
        if (error) throw new Error(`Запись установки цен: ${error.message}`);
      }
      docs += mapped.docRefs.length;
      written += rows.length;
    }
    const message = `Установок цен: ${docs}, строк: ${written}` + (partial ? ', остальное догрузится в следующий раз' : '');
    await saveState(db, true, message, 'price_settings');
    console.log(`[price_settings] ${((Date.now() - t0) / 1000).toFixed(1)}s ${message}`);
    return { ok: true, docs, lines: written, message, partial };
  } catch (e) {
    const err = e as Error;
    const message = err instanceof ODataError && err.status === 404
      ? 'Установка цен не открыта в OData: отметьте документ «Установка цен номенклатуры» в настройке стандартного интерфейса OData в 1С.'
      : err.message || 'Неизвестная ошибка';
    await saveState(db, false, message, 'price_settings');
    return { ok: false, docs: 0, lines: 0, message };
  }
}

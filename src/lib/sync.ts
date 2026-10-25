import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LINES_ENTITY, ONEC, SELECT, onecMode } from './onec/config';
import { mapItems, mapReceipts, mapSuppliers, postedReceiptRefs, type ReceiptLine } from './onec/map';
import { freshConnectionFetcher } from './onec/fetcher';
import { mockFetcher } from './onec/mock';
import { createODataClient, odataDate, type ODataClient, type ODataRow } from './onec/odata';
import { runAlerts } from './alert-runner';

export interface SyncResult {
  ok: boolean;
  docs: number;
  lines: number;
  items: number;
  suppliers: number;
  message: string;
}

/** Перекрытие при повторной синхронизации: правки в старых накладных за неделю тоже подтянутся. */
const OVERLAP_DAYS = 7;

export function makeOneCClient(): ODataClient {
  if (onecMode() === 'mock') {
    return createODataClient({ baseUrl: 'https://mock.1cfresh.local/odata/standard.odata', user: 'demo', password: 'demo', fetcher: mockFetcher });
  }
  const baseUrl = process.env.ONEC_ODATA_URL;
  if (!baseUrl) throw new Error('Не задан ONEC_ODATA_URL: адрес стандартного интерфейса OData вашего приложения 1С:Фреш.');
  return createODataClient({ baseUrl, user: process.env.ONEC_USER || '', password: process.env.ONEC_PASSWORD || '', fetcher: freshConnectionFetcher, log: true });
}

async function upsertChunks<T extends object>(db: SupabaseClient, table: string, rows: T[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`Запись в ${table}: ${error.message}`);
  }
}

async function refMap(db: SupabaseClient, table: 'items' | 'suppliers'): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select('id, onec_ref').range(from, from + 999);
    if (error) throw new Error(`Чтение ${table}: ${error.message}`);
    for (const r of data ?? []) if (r.onec_ref) map.set(r.onec_ref, r.id);
    if (!data || data.length < 1000) break;
  }
  return map;
}

async function syncSince(db: SupabaseClient): Promise<Date> {
  const days = Number(process.env.SYNC_DAYS_BACK || 180);
  const full = new Date(Date.now() - days * 86_400_000);
  // Строки, загруженные до появления «вида операции», перечитываем целиком за весь период
  if (onecMode() === 'odata') {
    const { count } = await db.from('purchases').select('id', { count: 'exact', head: true }).is('operation', null).gte('doc_date', full.toISOString());
    if (count) return full;
  }
  const { data } = await db.from('purchases').select('doc_date').order('doc_date', { ascending: false }).limit(1);
  if (data?.[0]?.doc_date) return new Date(Date.parse(data[0].doc_date) - OVERLAP_DAYS * 86_400_000);
  return full;
}

/**
 * Полный цикл: справочники → накладные с даты последней закупки минус неделя → строки закупок.
 * Строки изменённых, распроведённых и удалённых накладных переписываются целиком.
 */
export async function runSync(db: SupabaseClient, trigger: 'manual' | 'cron', onec: ODataClient = makeOneCClient()): Promise<SyncResult> {
  const { data: run } = await db.from('sync_runs').insert({ trigger }).select('id').single();
  const runId = run?.id as number | undefined;

  const finish = async (patch: Record<string, unknown>) => {
    if (runId) await db.from('sync_runs').update({ finished_at: new Date().toISOString(), ...patch }).eq('id', runId);
  };

  try {
    const t0 = Date.now();
    const log = (m: string) => console.log(`[sync] ${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
    const [rawItems, rawUnits, rawSuppliers] = await Promise.all([
      onec.list(ONEC.items.entity, { select: SELECT.items, pageSize: 60 }),
      onec.list(ONEC.units.entity, { select: SELECT.units }).catch(() => []),
      onec.list(ONEC.suppliers.entity, { select: SELECT.suppliers }),
    ]);
    log(`справочники: товаров ${rawItems.length}, ед. ${rawUnits.length}, контрагентов ${rawSuppliers.length}`);
    const items = mapItems(rawItems, rawUnits);
    const suppliers = mapSuppliers(rawSuppliers);
    const now = new Date().toISOString();
    await upsertChunks(db, 'items', items.map((i) => ({ ...i, updated_at: now })), 'onec_ref');
    await upsertChunks(db, 'suppliers', suppliers.map((s) => ({ ...s, updated_at: now })), 'onec_ref');

    const since = await syncSince(db);
    const rawDocs = await onec.list(ONEC.receipts.entity, { filter: `Date ge ${odataDate(since)}`, select: SELECT.receipts, pageSize: 60 });
    log(`шапки накладных с ${since.toISOString().slice(0, 10)}: ${rawDocs.length}`);

    // Строки забираем отдельно, пачками по 15 накладных и по 3 запроса одновременно
    const refs = postedReceiptRefs(rawDocs);
    const batches: string[][] = [];
    for (let i = 0; i < refs.length; i += 15) batches.push(refs.slice(i, i + 15));
    const rawLines: ODataRow[] = [];
    for (let i = 0; i < batches.length; i += 3) {
      const part = await Promise.all(batches.slice(i, i + 3).map((b) =>
        onec.list(LINES_ENTITY, { filter: b.map((r) => `Ref_Key eq guid'${r}'`).join(' or '), select: SELECT.lines, pageSize: 60, orderby: 'Ref_Key,LineNumber' })));
      part.forEach((p) => rawLines.push(...p));
    }
    const { lines, docRefs } = mapReceipts(rawDocs, rawLines);
    log(`строк накладных: ${rawLines.length}, к записи ${lines.length}`);

    const itemIds = await refMap(db, 'items');
    const supplierIds = await refMap(db, 'suppliers');
    const toRow = (l: ReceiptLine) => {
      const item_id = itemIds.get(l.item_ref);
      const supplier_id = supplierIds.get(l.supplier_ref);
      if (!item_id || !supplier_id) return null;
      return { onec_doc_ref: l.onec_doc_ref, line_no: l.line_no, doc_number: l.doc_number, doc_date: l.doc_date, item_id, supplier_id, price: l.price, qty: l.qty, operation: l.operation };
    };
    const rows = lines.map(toRow).filter((r): r is NonNullable<typeof r> => r !== null);

    // Какие накладные уже были в базе: по новым (впервые пришедшим) проверяем цены для сигналов
    const known = new Set<string>();
    for (let i = 0; i < docRefs.length; i += 200) {
      const { data } = await db.from('purchases').select('onec_doc_ref').in('onec_doc_ref', docRefs.slice(i, i + 200));
      (data ?? []).forEach((r) => known.add(r.onec_doc_ref));
    }
    const { count: before } = await db.from('purchases').select('id', { count: 'exact', head: true });

    for (let i = 0; i < docRefs.length; i += 200) {
      const { error } = await db.from('purchases').delete().in('onec_doc_ref', docRefs.slice(i, i + 200));
      if (error) throw new Error(`Очистка старых строк: ${error.message}`);
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from('purchases').insert(rows.slice(i, i + 500));
      if (error) throw new Error(`Запись закупок: ${error.message}`);
    }

    // Сигналы о ценах: только для накладных, которых раньше не было, и не при самой первой загрузке
    const alerts = before ? await runAlerts(db, rows.filter((r) => !known.has(r.onec_doc_ref))) : 0;
    if (alerts) log(`сигналов о ценах: ${alerts}`);

    const skipped = lines.length - rows.length;
    const message = `Накладных: ${docRefs.length}, строк: ${rows.length}` + (skipped ? `, пропущено строк без товара или поставщика: ${skipped}` : '');
    await finish({ status: 'ok', docs: docRefs.length, lines: rows.length, message });
    return { ok: true, docs: docRefs.length, lines: rows.length, items: items.length, suppliers: suppliers.length, message };
  } catch (e) {
    const message = (e as Error).message || 'Неизвестная ошибка';
    await finish({ status: 'error', message });
    return { ok: false, docs: 0, lines: 0, items: 0, suppliers: 0, message };
  }
}

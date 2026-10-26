import { EMPTY_REF, ONEC } from './config';
import type { ODataRow } from './odata';

export interface ItemRow { onec_ref: string; name: string; unit: string; category: string }
export interface SupplierRow { onec_ref: string; name: string; inn: string | null }
export interface ReceiptLine {
  onec_doc_ref: string;
  line_no: number;
  doc_number: string | null;
  doc_date: string;
  supplier_ref: string;
  item_ref: string;
  price: number;
  qty: number;
  /** Вид операции накладной как в 1С, например «ПоступлениеОтПоставщика» */
  operation: string | null;
}
export interface MappedReceipts {
  /** Проведённые накладные: строки, которые надо записать */
  lines: ReceiptLine[];
  /** Все накладные из выборки: их старые строки удаляются перед записью (учёт правок и отмены проведения) */
  docRefs: string[];
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const n = (v: unknown) => (typeof v === 'number' ? v : Number(str(v).replace(',', '.')) || 0);

/** 1С отдаёт дату без часового пояса, по времени базы. Для 1С:Фреш это московское время. */
export function onecDateToIso(v: unknown): string {
  const s = str(v);
  if (!s) return new Date(0).toISOString();
  if (/[zZ]|[+-]\d\d:\d\d$/.test(s)) return new Date(s).toISOString();
  return new Date(`${s}+03:00`).toISOString();
}

/** Номенклатура: товары без папок и без помеченных на удаление; категория — название родительской папки. */
export function mapItems(rows: ODataRow[], units: ODataRow[]): ItemRow[] {
  const folders = new Map<string, string>();
  for (const r of rows) if (r.IsFolder === true) folders.set(str(r.Ref_Key), str(r.Description).trim());
  const unitNames = new Map<string, string>();
  for (const u of units) unitNames.set(str(u.Ref_Key), str(u.Description).trim());

  return rows
    .filter((r) => r.IsFolder !== true && r.DeletionMark !== true)
    .map((r) => {
      const parent = str(r.Parent_Key);
      return {
        onec_ref: str(r.Ref_Key),
        name: str(r.Description).trim() || 'Без названия',
        unit: unitNames.get(str(r[ONEC.items.unitField])) || 'шт',
        category: (parent && parent !== EMPTY_REF && folders.get(parent)) || 'Без группы',
      };
    });
}

export function mapSuppliers(rows: ODataRow[]): SupplierRow[] {
  return rows
    .filter((r) => r.IsFolder !== true)
    .map((r) => ({
      onec_ref: str(r.Ref_Key),
      name: str(r.Description).trim() || 'Без названия',
      inn: str(r[ONEC.suppliers.innField]).trim() || null,
    }));
}

/** Накладные, строки которых нужно забрать: проведённые, не удалённые, с поставщиком. */
export function postedReceiptRefs(rows: ODataRow[]): string[] {
  return rows
    .filter((d) => d.Posted === true && d.DeletionMark !== true && str(d[ONEC.receipts.supplierField]) && str(d[ONEC.receipts.supplierField]) !== EMPTY_REF)
    .map((d) => str(d.Ref_Key))
    .filter(Boolean);
}

/**
 * Приходные накладные → строки закупок. Строки берутся из табличной части внутри документа
 * или из отдельно загруженного объекта «Запасы» (separateLines, связь по Ref_Key).
 * Непроведённые и помеченные на удаление дают только docRef (их строки удалятся).
 */
export function mapReceipts(rows: ODataRow[], separateLines?: ODataRow[]): MappedReceipts {
  const lines: ReceiptLine[] = [];
  const docRefs: string[] = [];
  const cfg = ONEC.receipts;
  // Строки по накладным; одна и та же строка могла прийти дважды на стыке страниц — оставляем одну
  const byDoc = new Map<string, Map<number, ODataRow>>();
  for (const l of separateLines ?? []) {
    const ref = str(l.Ref_Key);
    const m = byDoc.get(ref) ?? new Map<number, ODataRow>();
    m.set(n(l.LineNumber), l);
    byDoc.set(ref, m);
  }
  for (const d of rows) {
    const ref = str(d.Ref_Key);
    if (!ref) continue;
    docRefs.push(ref);
    if (d.Posted !== true || d.DeletionMark === true) continue;
    const supplier = str(d[cfg.supplierField]);
    if (!supplier || supplier === EMPTY_REF) continue;
    const date = onecDateToIso(d.Date);
    const operation = str(d[cfg.operationField]).trim() || null;
    const inline = Array.isArray(d[cfg.linesField]) ? (d[cfg.linesField] as ODataRow[]) : null;
    const tab = inline ?? [...(byDoc.get(ref)?.values() ?? [])].sort((a, b) => n(a.LineNumber) - n(b.LineNumber));
    tab.forEach((l, i) => {
      const item = str(l[cfg.itemField]);
      const price = n(l[cfg.priceField]);
      if (!item || item === EMPTY_REF || price <= 0) return;
      lines.push({
        onec_doc_ref: ref,
        line_no: n(l.LineNumber) || i + 1,
        doc_number: str(d.Number).trim() || null,
        doc_date: date,
        supplier_ref: supplier,
        item_ref: item,
        price: Math.round(price * 100) / 100,
        qty: n(l[cfg.qtyField]),
        operation,
      });
    });
  }
  return { lines, docRefs };
}

export interface ShipmentLine {
  onec_doc_ref: string;
  line_no: number;
  doc_number: string | null;
  doc_date: string;
  customer_ref: string;
  item_ref: string;
  qty: number;
  price: number;
  amount: number;
  operation: string | null;
  /** Вид цены документа; null — не указан */
  price_type_ref: string | null;
}

const ref = (v: unknown) => { const s = str(v); return s && s !== EMPTY_REF ? s : null; };

/** Расходные, строки которых нужно забрать: проведённые, не удалённые, с покупателем. */
export function postedShipmentRefs(rows: ODataRow[]): string[] {
  const f = ONEC.shipments.customerField;
  return rows
    .filter((d) => d.Posted === true && d.DeletionMark !== true && str(d[f]) && str(d[f]) !== EMPTY_REF)
    .map((d) => str(d.Ref_Key))
    .filter(Boolean);
}

/**
 * Расходные накладные → строки отгрузок. Как и с приходными: все документы выборки идут в docRefs
 * (их старые строки переписываются), строки — только у проведённых.
 */
export function mapShipments(rows: ODataRow[], separateLines: ODataRow[]): { lines: ShipmentLine[]; docRefs: string[] } {
  const cfg = ONEC.shipments;
  const byDoc = new Map<string, Map<number, ODataRow>>();
  for (const l of separateLines) {
    const lineDoc = str(l.Ref_Key);
    const m = byDoc.get(lineDoc) ?? new Map<number, ODataRow>();
    m.set(n(l.LineNumber), l);
    byDoc.set(lineDoc, m);
  }
  const lines: ShipmentLine[] = [];
  const docRefs: string[] = [];
  for (const d of rows) {
    const docRef = str(d.Ref_Key);
    if (!docRef) continue;
    docRefs.push(docRef);
    if (d.Posted !== true || d.DeletionMark === true) continue;
    const customer = str(d[cfg.customerField]);
    if (!customer || customer === EMPTY_REF) continue;
    const date = onecDateToIso(d.Date);
    const operation = str(d[cfg.operationField]).trim() || null;
    const priceType = ref(d[cfg.priceTypeField]);
    const tab = [...(byDoc.get(docRef)?.values() ?? [])].sort((a, b) => n(a.LineNumber) - n(b.LineNumber));
    tab.forEach((l, i) => {
      const item = str(l[cfg.itemField]);
      if (!item || item === EMPTY_REF) return;
      const qty = n(l[cfg.qtyField]);
      const price = n(l[cfg.priceField]);
      const amount = n(l[cfg.totalField]) || n(l[cfg.sumField]) || price * qty;
      lines.push({
        onec_doc_ref: docRef,
        line_no: n(l.LineNumber) || i + 1,
        doc_number: str(d.Number).trim() || null,
        doc_date: date,
        customer_ref: customer,
        item_ref: item,
        qty,
        price: Math.round(price * 100) / 100,
        amount: Math.round(amount * 100) / 100,
        operation,
        price_type_ref: priceType,
      });
    });
  }
  return { lines, docRefs };
}

export interface PriceSettingLine {
  onec_doc_ref: string;
  line_no: number;
  set_at: string;
  item_ref: string;
  price_type_ref: string | null;
  price: number;
  old_price: number | null;
}

/** Документы «Установка цен», строки которых нужно забрать: проведённые, не удалённые. */
export function postedRefs(rows: ODataRow[]): string[] {
  return rows.filter((d) => d.Posted === true && d.DeletionMark !== true).map((d) => str(d.Ref_Key)).filter(Boolean);
}

/** Установка цен → строки цен. Все документы выборки — на очистку, строки — только проведённых, с ценой больше нуля. */
export function mapPriceSettings(rows: ODataRow[], separateLines: ODataRow[]): { lines: PriceSettingLine[]; docRefs: string[] } {
  const cfg = ONEC.priceSettings;
  const posted = new Map<string, ODataRow>();
  const docRefs: string[] = [];
  for (const d of rows) {
    const r = str(d.Ref_Key);
    if (!r) continue;
    docRefs.push(r);
    if (d.Posted === true && d.DeletionMark !== true) posted.set(r, d);
  }
  const seen = new Set<string>();
  const lines: PriceSettingLine[] = [];
  for (const l of separateLines) {
    const docRef = str(l.Ref_Key);
    const d = posted.get(docRef);
    if (!d) continue;
    const lineNo = n(l.LineNumber);
    const key = `${docRef}:${lineNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const item = ref(l[cfg.itemField]);
    const price = n(l[cfg.priceField]);
    if (!item || price <= 0) continue;
    const old = n(l[cfg.oldPriceField]);
    lines.push({
      onec_doc_ref: docRef,
      line_no: lineNo,
      set_at: onecDateToIso(d.Date),
      item_ref: item,
      price_type_ref: ref(l[cfg.priceTypeField]),
      price: Math.round(price * 100) / 100,
      old_price: old > 0 ? Math.round(old * 100) / 100 : null,
    });
  }
  return { lines, docRefs };
}

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
  const byDoc = new Map<string, ODataRow[]>();
  for (const l of separateLines ?? []) {
    const ref = str(l.Ref_Key);
    byDoc.set(ref, [...(byDoc.get(ref) ?? []), l]);
  }
  for (const d of rows) {
    const ref = str(d.Ref_Key);
    if (!ref) continue;
    docRefs.push(ref);
    if (d.Posted !== true || d.DeletionMark === true) continue;
    const supplier = str(d[cfg.supplierField]);
    if (!supplier || supplier === EMPTY_REF) continue;
    const date = onecDateToIso(d.Date);
    const inline = Array.isArray(d[cfg.linesField]) ? (d[cfg.linesField] as ODataRow[]) : null;
    const tab = inline ?? (byDoc.get(ref) ?? []).sort((a, b) => n(a.LineNumber) - n(b.LineNumber));
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
      });
    });
  }
  return { lines, docRefs };
}

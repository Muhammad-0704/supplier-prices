/**
 * Имена объектов и реквизитов 1С:УНФ в стандартном интерфейсе OData.
 * Если в вашей конфигурации что-то называется иначе, поправьте здесь.
 * Проверить точные имена можно по адресу <ONEC_ODATA_URL>/$metadata.
 */
export const ONEC = {
  items: {
    entity: 'Catalog_Номенклатура',
    unitField: 'ЕдиницаИзмерения_Key',
  },
  units: {
    entity: 'Catalog_КлассификаторЕдиницИзмерения',
  },
  suppliers: {
    entity: 'Catalog_Контрагенты',
    innField: 'ИНН',
  },
  receipts: {
    entity: 'Document_ПриходнаяНакладная',
    supplierField: 'Контрагент_Key',
    /** Табличная часть с товарами */
    linesField: 'Запасы',
    itemField: 'Номенклатура_Key',
    qtyField: 'Количество',
    priceField: 'Цена',
  },
  pageSize: 500,
} as const;

/** Только нужные реквизиты: без $select 1С отдаёт объект целиком со всеми табличными частями, это в разы медленнее. */
export const SELECT = {
  items: ['Ref_Key', 'Description', 'IsFolder', 'Parent_Key', 'DeletionMark', ONEC.items.unitField],
  units: ['Ref_Key', 'Description'],
  suppliers: ['Ref_Key', 'Description', 'IsFolder', ONEC.suppliers.innField],
  receipts: ['Ref_Key', 'Number', 'Date', 'Posted', 'DeletionMark', ONEC.receipts.supplierField, ONEC.receipts.linesField],
};

export const EMPTY_REF = '00000000-0000-0000-0000-000000000000';

export type OneCMode = 'mock' | 'odata';

export function onecMode(): OneCMode {
  return process.env.ONEC_MODE === 'odata' ? 'odata' : 'mock';
}

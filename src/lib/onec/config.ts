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

export const EMPTY_REF = '00000000-0000-0000-0000-000000000000';

export type OneCMode = 'mock' | 'odata';

export function onecMode(): OneCMode {
  return process.env.ONEC_MODE === 'odata' ? 'odata' : 'mock';
}

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
    /** Вид операции: поступление от поставщика, возврат от покупателя и т.д. */
    operationField: 'ВидОперации',
    /** Табличная часть с товарами */
    linesField: 'Запасы',
    itemField: 'Номенклатура_Key',
    qtyField: 'Количество',
    priceField: 'Цена',
  },
  /** Расходные накладные склада: отгрузки на точки (покупателей) */
  shipments: {
    entity: 'Document_РасходнаяНакладная',
    customerField: 'Контрагент_Key',
    operationField: 'ВидОперации',
    /** Вид цены документа: сравнивается с установленной ценой того же вида */
    priceTypeField: 'ВидЦен_Key',
    linesField: 'Запасы',
    itemField: 'Номенклатура_Key',
    qtyField: 'Количество',
    priceField: 'Цена',
    /** Сумма строки с НДС; если пусто — «Сумма» или цена × количество */
    totalField: 'Всего',
    sumField: 'Сумма',
  },
  /** Установка цен номенклатуры: продажные цены склада, по которым выписываются расходные */
  priceSettings: {
    entity: 'Document_УстановкаЦенНоменклатуры',
    linesField: 'Запасы',
    itemField: 'Номенклатура_Key',
    priceTypeField: 'ВидЦены_Key',
    priceField: 'Цена',
    oldPriceField: 'ЦенаСтарая',
  },
  /** Ответ до ~20 КБ: большие передачи из 1С:Фреш за рубеж зависают */
  pageSize: 60,
} as const;

/** Только нужные реквизиты: без $select 1С отдаёт объект целиком со всеми табличными частями, это в разы медленнее. */
export const SELECT = {
  items: ['Ref_Key', 'Description', 'IsFolder', 'Parent_Key', 'DeletionMark', ONEC.items.unitField],
  units: ['Ref_Key', 'Description'],
  suppliers: ['Ref_Key', 'Description', 'IsFolder', ONEC.suppliers.innField],
  /** Шапки накладных без табличной части: строки забираются отдельно, иначе ответ слишком большой */
  receipts: ['Ref_Key', 'Number', 'Date', 'Posted', 'DeletionMark', ONEC.receipts.supplierField, ONEC.receipts.operationField],
  lines: ['Ref_Key', 'LineNumber', ONEC.receipts.itemField, ONEC.receipts.qtyField, ONEC.receipts.priceField],
  shipments: ['Ref_Key', 'Number', 'Date', 'Posted', 'DeletionMark', ONEC.shipments.customerField, ONEC.shipments.operationField, ONEC.shipments.priceTypeField],
  priceSettings: ['Ref_Key', 'Date', 'Posted', 'DeletionMark'],
  priceSettingLines: ['Ref_Key', 'LineNumber', ONEC.priceSettings.itemField, ONEC.priceSettings.priceTypeField, ONEC.priceSettings.priceField, ONEC.priceSettings.oldPriceField],
  shipmentLines: ['Ref_Key', 'LineNumber', ONEC.shipments.itemField, ONEC.shipments.qtyField, ONEC.shipments.priceField, ONEC.shipments.sumField, ONEC.shipments.totalField],
};

export const SHIPMENT_LINES_ENTITY = `${ONEC.shipments.entity}_${ONEC.shipments.linesField}`;
export const PRICE_SETTING_LINES_ENTITY = `${ONEC.priceSettings.entity}_${ONEC.priceSettings.linesField}`;

/** Табличная часть как отдельный объект OData: Document_ПриходнаяНакладная_Запасы */
export const LINES_ENTITY = `${ONEC.receipts.entity}_${ONEC.receipts.linesField}`;

export const EMPTY_REF = '00000000-0000-0000-0000-000000000000';

export type OneCMode = 'mock' | 'odata';

export function onecMode(): OneCMode {
  return process.env.ONEC_MODE === 'odata' ? 'odata' : 'mock';
}

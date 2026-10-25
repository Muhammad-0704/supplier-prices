import { describe, expect, it } from 'vitest';
import { mapItems, mapReceipts, mapSuppliers, onecDateToIso } from '../src/lib/onec/map';
import { basicAuth, buildUrl, createODataClient, odataDate } from '../src/lib/onec/odata';
import { buildMockBase, mockFetcher } from '../src/lib/onec/mock';

const EMPTY = '00000000-0000-0000-0000-000000000000';

describe('разбор OData 1С', () => {
  it('номенклатура: папки становятся категориями, удалённые пропускаются', () => {
    const rows = [
      { Ref_Key: 'f1', Description: 'Молочка', IsFolder: true, Parent_Key: EMPTY },
      { Ref_Key: 'i1', Description: ' Сливки 33% 1 л ', IsFolder: false, Parent_Key: 'f1', ЕдиницаИзмерения_Key: 'u1' },
      { Ref_Key: 'i2', Description: 'Без папки', IsFolder: false, Parent_Key: EMPTY },
      { Ref_Key: 'i3', Description: 'Удалённый', IsFolder: false, Parent_Key: 'f1', DeletionMark: true },
    ];
    expect(mapItems(rows, [{ Ref_Key: 'u1', Description: 'шт' }])).toEqual([
      { onec_ref: 'i1', name: 'Сливки 33% 1 л', unit: 'шт', category: 'Молочка' },
      { onec_ref: 'i2', name: 'Без папки', unit: 'шт', category: 'Без группы' },
    ]);
  });

  it('контрагенты без папок, с ИНН', () => {
    expect(mapSuppliers([
      { Ref_Key: 's1', Description: 'МолПродСнаб', IsFolder: false, ИНН: '7701234567' },
      { Ref_Key: 'g', Description: 'Поставщики', IsFolder: true },
    ])).toEqual([{ onec_ref: 's1', name: 'МолПродСнаб', inn: '7701234567' }]);
  });

  it('накладные: строки только у проведённых, но все попадают в список на очистку', () => {
    const { lines, docRefs } = mapReceipts([
      { Ref_Key: 'd1', Number: 'ПН-000001 ', Date: '2026-10-20T10:15:00', Posted: true, DeletionMark: false, Контрагент_Key: 's1',
        Запасы: [{ LineNumber: 1, Номенклатура_Key: 'i1', Количество: 12, Цена: 498.5 }, { LineNumber: 2, Номенклатура_Key: EMPTY, Количество: 1, Цена: 10 }] },
      { Ref_Key: 'd2', Number: 'ПН-000002', Date: '2026-10-21T10:00:00', Posted: false, Контрагент_Key: 's1', Запасы: [{ LineNumber: 1, Номенклатура_Key: 'i1', Количество: 1, Цена: 1 }] },
    ]);
    expect(docRefs).toEqual(['d1', 'd2']);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ onec_doc_ref: 'd1', line_no: 1, doc_number: 'ПН-000001', item_ref: 'i1', supplier_ref: 's1', price: 498.5, qty: 12 });
    expect(lines[0].doc_date).toBe('2026-10-20T07:15:00.000Z');
  });

  it('дата 1С без пояса считается московской', () => {
    expect(onecDateToIso('2026-10-25T09:00:00')).toBe('2026-10-25T06:00:00.000Z');
    expect(onecDateToIso('2026-10-25T09:00:00Z')).toBe('2026-10-25T09:00:00.000Z');
  });

  it('URL, фильтр по дате и авторизация с русским логином', () => {
    expect(odataDate(new Date('2026-05-01T00:00:00Z'))).toBe("datetime'2026-05-01T00:00:00'");
    expect(buildUrl('https://1cfresh.com/a/sbm/1/odata/standard.odata/', 'Catalog_Контрагенты', { $format: 'json', $top: 10, $filter: undefined }))
      .toBe('https://1cfresh.com/a/sbm/1/odata/standard.odata/Catalog_%D0%9A%D0%BE%D0%BD%D1%82%D1%80%D0%B0%D0%B3%D0%B5%D0%BD%D1%82%D1%8B?$format=json&$top=10');
    expect(Buffer.from(basicAuth('Доска', 'пароль').slice(6), 'base64').toString('utf8')).toBe('Доска:пароль');
  });

  it('клиент читает демо-базу постранично и понятно сообщает об ошибке доступа', async () => {
    const client = createODataClient({ baseUrl: 'https://mock/odata/standard.odata', user: 'u', password: 'p', fetcher: mockFetcher });
    const base = buildMockBase();
    const items = await client.list('Catalog_Номенклатура');
    expect(items.length).toBe(base.items.length);
    const mapped = mapItems(items, await client.list('Catalog_КлассификаторЕдиницИзмерения'));
    expect(mapped.length).toBeGreaterThanOrEqual(200);
    const docs = mapReceipts(await client.list('Document_ПриходнаяНакладная', { filter: `Date ge ${odataDate(new Date(Date.now() - 200 * 86_400_000))}` }));
    expect(docs.lines.length).toBeGreaterThan(500);

    const denied = createODataClient({ baseUrl: 'https://x', user: 'u', password: 'p', fetcher: async () => new Response('', { status: 401 }) });
    await expect(denied.list('Catalog_Контрагенты')).rejects.toThrow(/логин или пароль/);
  });
});

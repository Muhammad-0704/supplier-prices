import { describe, expect, it } from 'vitest';
import { parseMeasure } from '../src/lib/measure';
import { compareToItem, extractRows, guessColumns, matchRows, parseCsv, parsePrice, type OurItem } from '../src/lib/pricelist';

const item = (id: string, name: string, unit: string, bestPrice: number): OurItem => ({ id, name, unit, bestPrice, bestSupplierId: 'S', measure: parseMeasure(name, unit) });

describe('прайс из файла', () => {
  it('цены в разных записях', () => {
    expect(parsePrice('1 250,50 ₽')).toBe(1250.5);
    expect(parsePrice('980 руб.')).toBe(980);
    expect(parsePrice(45.2)).toBe(45.2);
    expect(parsePrice('по запросу')).toBeNull();
    expect(parsePrice(0)).toBeNull();
  });

  it('находит заголовок под шапкой фирмы и пропускает разделы', () => {
    const grid = [
      ['ООО «Ромашка», прайс на 25.10', null, null],
      [null, null, null],
      ['№', 'Наименование товара', 'Ед. изм.', 'Цена, руб'],
      [null, 'БАКАЛЕЯ', null, null],
      [1, 'Сахар-песок 25 кг', 'меш', '1 500'],
      [2, 'Соль поваренная 1кг', 'шт', 32.5],
    ];
    const cols = guessColumns(grid)!;
    expect(cols).toEqual({ header: 2, name: 1, price: 3, unit: 2 });
    const rows = extractRows(grid, cols);
    expect(rows.map((r) => [r.name, r.price, r.unit])).toEqual([['Сахар-песок 25 кг', 1500, 'меш'], ['Соль поваренная 1кг', 32.5, 'шт']]);
  });

  it('без заголовка: текст и числа', () => {
    const cols = guessColumns([['Сахар-песок 25 кг', 1500], ['Мука пшеничная 10кг', 600], ['Соль 1кг', 30]])!;
    expect(cols).toMatchObject({ header: -1, name: 0, price: 1 });
  });

  it('CSV с точкой с запятой и кавычками', () => {
    expect(parseCsv('﻿Название;Цена\r\n"Масло «Олейна»; 1л";120,5\n')).toEqual([['Название', 'Цена'], ['Масло «Олейна»; 1л', '120,5']]);
  });

  it('сопоставляет и пересчитывает 25 кг на наш мешок 10 кг', () => {
    const ours = [item('sugar', 'Сахар-песок 10кг/уп', 'шт', 700), item('salt', 'Соль поваренная пищевая «Экстра» мелкая, 1кг', 'шт', 30)];
    const m = matchRows([{ line: 1, name: 'САХАР ПЕСОК 25кг', price: 1500, unit: 'меш' }, { line: 2, name: 'Гвозди 100мм', price: 5, unit: null }], ours);
    expect(m[0].itemId).toBe('sugar');
    expect(m[1].itemId).toBeNull();
    const c = compareToItem(m[0].row, ours[0]);
    expect(c.converted).toBe(true);
    expect(c.price).toBe(600);
    expect(c.diff).toBeCloseTo(-0.142857, 4);
  });
});

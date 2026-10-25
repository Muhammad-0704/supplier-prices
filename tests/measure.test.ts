import { describe, expect, it } from 'vitest';
import { parseMeasure, perBasePrice } from '../src/lib/measure';
import { bestMatches, similarity, tokens } from '../src/lib/similar';

describe('фасовка из названия', () => {
  const m = (name: string, unit: string) => parseMeasure(name, unit);

  it('единица уже кг или л', () => {
    expect(m('Фасоль стручковая резаная с/м, 10кг/кор, Россия', 'кг')).toMatchObject({ base: 'кг', perUnit: 1 });
    expect(m('Вода', 'л (дм3)')).toMatchObject({ base: 'л', perUnit: 1 });
  });

  it('граммы, литры, миллилитры в штуке', () => {
    expect(m('Тунец кусочками в масле «Лента», 185г', 'шт')).toMatchObject({ base: 'кг', perUnit: 0.185 });
    expect(m('Напиток газированный Кинза, ж/б, 0,32л (в ассортименте)', 'шт')).toMatchObject({ base: 'л', perUnit: 0.32 });
    expect(m('Перец халапеньо «Виктория», ПЭТ, 3800мл, 4шт/кор', 'шт')).toMatchObject({ base: 'л', perUnit: 3.8 });
    expect(m('Сыр Сулугуни, 5кг', 'шт')).toMatchObject({ base: 'кг', perUnit: 5 });
    expect(m('Пекарский порошок Ovalette, ведро 2кг', 'шт')).toMatchObject({ base: 'кг', perUnit: 2 });
  });

  it('коробка: вес в коробке или штуки × вес', () => {
    expect(m('Изюм "Малаяр" 10кг, Иран', 'кор')).toMatchObject({ base: 'кг', perUnit: 10 });
    expect(m('Батончик Bounty Трио, 82,5г, 24шт/кор', 'кор')!.perUnit).toBeCloseTo(1.98);
    expect(m('Батончик Bounty Трио, 82,5г, 24шт/кор', 'шт')!.perUnit).toBeCloseTo(0.0825);
  });

  it('штуки в упаковке', () => {
    expect(m('Пакет-майка белый 25х45см, 2500шт', 'упак')).toMatchObject({ base: 'шт', perUnit: 2500 });
    expect(m('Перчатки одноразовые п/э, 100шт', 'шт')).toMatchObject({ base: 'шт', perUnit: 100 });
  });

  it('не путает микроны, миллиметры и объём мусорного мешка', () => {
    expect(m('Пленка пищевая ПВХ «Исток» 45х700, 8мкм', 'шт')).toBeNull();
    expect(m('Мешки для мусора «Мешкофф» 240л, ПВД', 'рул')).toBeNull();
    expect(m('Капуста белокочанная', 'шт')).toBeNull();
    expect(m('Контейнер ПП прозрачный 750мл, 179х132х46мм', 'шт')).toBeNull();
    expect(m('Ведро 15л', 'шт')).toBeNull();
    expect(m('Майонез «Московский Провансаль» 67%, ведро 10л', 'шт')).toMatchObject({ base: 'л', perUnit: 10 });
  });

  it('цена за кг', () => {
    expect(perBasePrice(1500, { base: 'кг', perUnit: 25, source: 'auto' })).toBe(60);
    expect(perBasePrice(1500, null)).toBeNull();
  });
});

describe('похожие названия', () => {
  it('слова без размеров и стран', () => {
    expect(tokens('Масло подсолнечное «Олейна» 1 сорт, 1л, Россия')).toEqual(['масло', 'подсол', 'олейна', 'сорт']);
  });

  it('главное слово должно совпадать', () => {
    expect(similarity(tokens('Сахар белый 50кг'), tokens('Сахар-песок белый, 25 кг'))).toBeGreaterThan(0.3);
    expect(similarity(tokens('Масло сливочное 82%'), tokens('Сливки 33%'))).toBe(0);
  });

  it('жирность и номер различают товары', () => {
    expect(tokens('Маргарин мягкий «Землянские узоры» 72%, 5кг')).toContain('p72');
    const w = tokens('Шоколад белый Callebaut №W2 25,9%, каллеты, 10кг, Бельгия');
    expect(similarity(w, tokens('Шоколад белый Callebaut №W2 25,9%, каллеты, 2,5кг, Бельгия'))).toBe(1);
    expect(similarity(w, tokens('Шоколад молочный Callebaut №823 33,6%, каллеты, 10кг, Бельгия'))).toBeLessThan(0.5);
  });

  it('лучшее совпадение из списка', () => {
    const items = ['Сахар-песок, 50кг', 'Соль поваренная 1кг', 'Масло подсолнечное «Олейна» 1л'].map((name) => ({ name, tokens: tokens(name) }));
    const r = bestMatches('САХАР ПЕСОК меш. 25кг', items);
    expect(r[0].item.name).toBe('Сахар-песок, 50кг');
    expect(bestMatches('Мука пшеничная', items)).toEqual([]);
  });
});

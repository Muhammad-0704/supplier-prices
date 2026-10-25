import { describe, expect, it } from 'vitest';
import { compareToOurs, linkState, newToken, validatePayload } from '../src/lib/offers';

describe('предложения поставщиков', () => {
  it('токен ссылки длинный и случайный', () => {
    const a = newToken(), b = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
  });

  it('сравнение без цифр: ниже / на уровне / выше', () => {
    expect(compareToOurs(95, 100)).toBe('lower');
    expect(compareToOurs(100.3, 100)).toBe('same');
    expect(compareToOurs(110, 100)).toBe('higher');
    expect(compareToOurs(50, undefined)).toBe('unknown');
  });

  it('ссылка: отключена и истёкшая не работают', () => {
    expect(linkState({ active: true, expires_at: null })).toBe('active');
    expect(linkState({ active: false, expires_at: null })).toBe('disabled');
    expect(linkState({ active: true, expires_at: '2020-01-01T00:00:00Z' })).toBe('expired');
  });

  it('отправка: товары вне списка отбрасываются, цены нормализуются, свои товары принимаются', () => {
    const allowed = new Set(['a', 'b']);
    const r = validatePayload({
      contact: '  Иван ',
      lines: [
        { itemId: 'a', price: '1 250,50', minQty: '10 кг' },
        { itemId: 'zzz', price: 10 },
        { itemId: 'b', price: '' },
        { customName: 'Сыр рикотта', unit: 'кг', price: 640 },
        { customName: '   ', price: 5 },
      ],
    }, allowed);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.contact).toBe('Иван');
    expect(r.value.lines).toEqual([
      { itemId: 'a', price: 1250.5, minQty: '10 кг', validUntil: undefined, comment: undefined },
      { customName: 'Сыр рикотта', unit: 'кг', price: 640, minQty: undefined, validUntil: undefined, comment: undefined },
    ]);
  });

  it('отправка без цен и с абсурдной ценой отклоняется', () => {
    expect(validatePayload({ lines: [{ itemId: 'a', price: 0 }] }, new Set(['a'])).ok).toBe(false);
    expect(validatePayload({ lines: [{ itemId: 'a', price: 1e12 }] }, new Set(['a'])).ok).toBe(false);
    expect(validatePayload(null, new Set()).ok).toBe(false);
  });
});

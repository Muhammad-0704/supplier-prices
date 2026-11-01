import { describe, expect, it } from 'vitest';
import { newTvToken } from '../src/lib/tv';

describe('ссылка ТВ', () => {
  it('токен длинный и случайный', () => {
    const a = newTvToken(), b = newTvToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe('ТВ: короткий вход по коду', () => {
  it('код — всегда 6 цифр', async () => {
    const { newPairCode } = await import('../src/lib/tv');
    for (let i = 0; i < 200; i++) expect(newPairCode()).toMatch(/^\d{6}$/);
  });
  it('из набранного пультом берутся только цифры', async () => {
    const { cleanPairCode } = await import('../src/lib/tv');
    expect(cleanPairCode('042 917')).toBe('042917');
    expect(cleanPairCode(' 04-29-17 ')).toBe('042917');
    expect(cleanPairCode('12345')).toBeNull();
    expect(cleanPairCode('1234567')).toBeNull();
  });
  it('перебор: 10 неудач с адреса или 100 всего — стоп', async () => {
    const { pairBlocked } = await import('../src/lib/tv');
    expect(pairBlocked(9, 99)).toBe(false);
    expect(pairBlocked(10, 0)).toBe(true);
    expect(pairBlocked(0, 100)).toBe(true);
  });
});

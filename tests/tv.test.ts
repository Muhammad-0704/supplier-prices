import { describe, expect, it } from 'vitest';
import { newTvToken } from '../src/lib/tv';

describe('ссылка ТВ', () => {
  it('токен длинный и случайный', () => {
    const a = newTvToken(), b = newTvToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
  });
});

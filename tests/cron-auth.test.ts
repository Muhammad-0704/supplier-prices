import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkCronSecret } from '../src/lib/cron-auth';

function req(auth?: string) {
  return new NextRequest('https://x.test/api/sync', { headers: auth ? { authorization: auth } : {} });
}

describe('checkCronSecret', () => {
  const prev = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = 'top-secret-value';
  });
  afterEach(() => {
    process.env.CRON_SECRET = prev;
  });

  it('пускает правильный Bearer-токен', () => {
    expect(checkCronSecret(req('Bearer top-secret-value'))).toBe(true);
  });

  it('не пускает без заголовка', () => {
    expect(checkCronSecret(req())).toBe(false);
  });

  it('не пускает неверный секрет', () => {
    expect(checkCronSecret(req('Bearer wrong'))).toBe(false);
  });

  it('не пускает секрет другой длины', () => {
    expect(checkCronSecret(req('Bearer short'))).toBe(false);
  });

  it('не пускает, если CRON_SECRET не задан', () => {
    delete process.env.CRON_SECRET;
    expect(checkCronSecret(req('Bearer top-secret-value'))).toBe(false);
  });
});

import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * Сравнение `Authorization: Bearer <CRON_SECRET>` через timingSafeEqual — обычное `!==`
 * сравнивает строки по первому несовпавшему байту, что теоретически позволяет подбирать
 * секрет по времени ответа. Секретов без заданного CRON_SECRET не пускаем.
 */
export function checkCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization');
  if (!secret || !header) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

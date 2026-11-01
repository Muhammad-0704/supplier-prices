'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanPairCode, PAIR_TTL_MS, pairBlocked } from '@/lib/tv';

export type PairState = { error?: string } | null;

/** Вход на ТВ по 6 цифрам: находит ссылку с действующим кодом, гасит код и открывает экран. */
export async function pairTv(_prev: PairState, form: FormData): Promise<PairState> {
  const code = cleanPairCode(String(form.get('code') ?? ''));
  if (!code) return { error: 'Введите 6 цифр.' };

  const db = createAdminClient();
  const h = headers();
  const ip = (h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0, 64);
  const since = new Date(Date.now() - PAIR_TTL_MS).toISOString();
  const [fromIp, all] = await Promise.all([
    db.from('tv_pair_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('ok', false).gte('at', since),
    db.from('tv_pair_attempts').select('id', { count: 'exact', head: true }).eq('ok', false).gte('at', since),
  ]);
  if (fromIp.error || all.error) return { error: 'Вход по коду ещё не включён. Откройте ссылку из «Доступов».' };
  if (pairBlocked(fromIp.count ?? 0, all.count ?? 0)) return { error: 'Слишком много неверных попыток. Подождите 10 минут.' };

  const { data: link } = await db.from('tv_links').select('id, token').eq('pair_code', code).eq('active', true).gt('pair_expires', new Date().toISOString()).maybeSingle();
  await db.from('tv_pair_attempts').insert({ ip, ok: !!link });
  if (!link) return { error: 'Код не подошёл или уже истёк. Получите новый в «Доступах».' };

  // Код одноразовый
  await db.from('tv_links').update({ pair_code: null, pair_expires: null }).eq('id', link.id);
  // Старые записи журнала больше не нужны
  void db.from('tv_pair_attempts').delete().lt('at', new Date(Date.now() - 24 * 3_600_000).toISOString());
  redirect(`/tv/${link.token}`);
}

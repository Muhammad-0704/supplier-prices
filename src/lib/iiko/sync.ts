import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mskDay } from '../canteens';
import { fetchRevenue } from './client';

export interface IikoSyncResult { ok: boolean; message: string; skipped?: boolean }

/** Раз в 30 минут достаточно: каждый вход в iiko занимает лицензию */
const EVERY_MS = 30 * 60_000;
const DAY = 86_400_000;

export function iikoConfigured(): boolean {
  return !!process.env.IIKO_LOGIN && !!process.env.IIKO_PASSWORD;
}

async function saveState(db: SupabaseClient, ok: boolean, message: string) {
  await db.from('sync_state').upsert({ key: 'iiko', at: new Date().toISOString(), ok, message });
}

/**
 * Выручка точек из iiko → iiko_revenue. Первый раз — с начала прошлого месяца, дальше — последние 3 дня
 * (чеки могут закрыть или вернуть задним числом). Ошибка одной точки не мешает остальным.
 */
export async function runIikoSync(db: SupabaseClient, force = false): Promise<IikoSyncResult | null> {
  if (!iikoConfigured()) return null;
  if (!force) {
    const { data } = await db.from('sync_state').select('at').eq('key', 'iiko').maybeSingle();
    if (data?.at && Date.now() - Date.parse(data.at) < EVERY_MS) return { ok: true, message: 'iiko: недавно обновляли', skipped: true };
  }
  const { data: servers, error } = await db.from('iiko_servers').select('canteen_id, host, login, canteens(name)').eq('active', true);
  if (error) { await saveState(db, false, `iiko: ${error.message}`); return { ok: false, message: error.message }; }

  const now = Date.now();
  const to = mskDay(now + DAY);
  const monthStart = mskDay(now).slice(0, 7) + '-01';
  const prevMonthStart = mskDay(Date.parse(`${monthStart}T12:00:00+03:00`) - 5 * DAY).slice(0, 7) + '-01';

  const done: string[] = [];
  const failed: string[] = [];
  for (const s of servers ?? []) {
    const name = (s.canteens as unknown as { name?: string } | null)?.name ?? s.host;
    try {
      const { data: last } = await db.from('iiko_revenue').select('day').eq('canteen_id', s.canteen_id).order('day', { ascending: false }).limit(1);
      const from = last?.[0]?.day ? mskDay(Date.parse(`${last[0].day}T12:00:00+03:00`) - 2 * DAY) : prevMonthStart;
      const days = await fetchRevenue(s.host, s.login || process.env.IIKO_LOGIN!, process.env.IIKO_PASSWORD!, from, to);
      if (days.length) {
        const synced_at = new Date().toISOString();
        const { error: e } = await db.from('iiko_revenue').upsert(days.map((d) => ({
          canteen_id: s.canteen_id, day: d.day, cash: d.cash, card: d.card, total: d.total, checks: d.checks, by_pay_type: d.byPayType, synced_at,
        })), { onConflict: 'canteen_id,day' });
        if (e) throw new Error(e.message);
      }
      done.push(`${name}: ${days.length} дн.`);
    } catch (e) {
      failed.push(`${name} — ${(e as Error).message}`);
    }
  }
  const message = [done.length ? `iiko: ${done.join(', ')}` : '', failed.length ? `ошибки: ${failed.join('; ')}` : ''].filter(Boolean).join('. ') || 'iiko: серверов нет';
  await saveState(db, failed.length === 0, message);
  console.log(`[iiko] ${message}`);
  return { ok: failed.length === 0, message };
}

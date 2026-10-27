import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mskDay } from '../canteens';
import { fetchSales, type IikoSales } from './client';

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
      // Тестовые строки (demo) не считаются: первая настоящая загрузка берёт всё с начала прошлого месяца
      const { data: last } = await db.from('iiko_revenue').select('day').eq('canteen_id', s.canteen_id).eq('demo', false).order('day', { ascending: false }).limit(1);
      const from = last?.[0]?.day ? mskDay(Date.parse(`${last[0].day}T12:00:00+03:00`) - 2 * DAY) : prevMonthStart;
      const sales = await fetchSales(s.host, s.login || process.env.IIKO_LOGIN!, process.env.IIKO_PASSWORD!, from, to);
      const days = sales.days;
      await dropDemo(db, s.canteen_id);
      if (days.length) {
        const synced_at = new Date().toISOString();
        const { error: e } = await db.from('iiko_revenue').upsert(days.map((d) => ({
          canteen_id: s.canteen_id, day: d.day, cash: d.cash, card: d.card, total: d.total, checks: d.checks, by_pay_type: d.byPayType, synced_at,
        })), { onConflict: 'canteen_id,day' });
        if (e) throw new Error(e.message);
      }
      await saveDetails(db, s.canteen_id, from, to, sales);
      done.push(`${name}: ${days.length} дн.${sales.skipped.length ? ` (без: ${sales.skipped.map((x) => x.split(':')[0]).join(', ')})` : ''}`);
      if (sales.skipped.length) console.log(`[iiko] ${name}: ${sales.skipped.join('; ')}`);
    } catch (e) {
      failed.push(`${name} — ${(e as Error).message}`);
    }
  }
  const message = [done.length ? `iiko: ${done.join(', ')}` : '', failed.length ? `ошибки: ${failed.join('; ')}` : ''].filter(Boolean).join('. ') || 'iiko: серверов нет';
  await saveState(db, failed.length === 0, message);
  console.log(`[iiko] ${message}`);
  return { ok: failed.length === 0, message };
}

const DETAIL_TABLES = ['iiko_hours', 'iiko_dishes', 'iiko_staff', 'iiko_voids'] as const;

/** Тестовые данные точки уходят, как только iiko отдал настоящие */
async function dropDemo(db: SupabaseClient, canteenId: string) {
  for (const t of ['iiko_revenue', ...DETAIL_TABLES]) {
    const { error } = await db.from(t).delete().eq('canteen_id', canteenId).eq('demo', true);
    if (error && !/does not exist|schema cache/i.test(error.message)) throw new Error(`${t}: ${error.message}`);
  }
}

/** Подробности за период заменяются целиком: чеки могли удалить или вернуть задним числом */
async function saveDetails(db: SupabaseClient, canteenId: string, from: string, to: string, sales: IikoSales) {
  const parts: [typeof DETAIL_TABLES[number], object[] | null][] = [
    ['iiko_hours', sales.hours], ['iiko_dishes', sales.dishes], ['iiko_staff', sales.staff], ['iiko_voids', sales.voids],
  ];
  for (const [table, rows] of parts) {
    if (!rows) continue; // срез не пришёл — старые данные не трогаем
    const del = await db.from(table).delete().eq('canteen_id', canteenId).gte('day', from).lt('day', to);
    if (del.error) {
      if (/does not exist|schema cache/i.test(del.error.message)) return; // таблиц ещё нет — подробности пропускаем
      throw new Error(`${table}: ${del.error.message}`);
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(table).insert(rows.slice(i, i + 500).map((r) => ({ ...r, canteen_id: canteenId })));
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }
}

import { NextResponse, type NextRequest } from 'next/server';
import { SITE_URL } from '@/lib/alert-runner';
import { healthAlerts, type HealthKey, type HealthState } from '@/lib/sync-health';
import { notify } from '@/lib/telegram';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { runIikoSync } from '@/lib/iiko/sync';
import { runPriceSettingsSync, runShipmentsSync } from '@/lib/shipments-sync';
import { makeOneCClient, runSync } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Не запускать вторую синхронизацию, пока идёт первая (кнопку могут нажать двое одновременно). */
async function alreadyRunning(db: ReturnType<typeof createAdminClient>) {
  const since = new Date(Date.now() - 6 * 60_000).toISOString();
  const { data } = await db.from('sync_runs').select('id').eq('status', 'running').gte('started_at', since).limit(1);
  return !!data?.length;
}

async function handle(trigger: 'manual' | 'cron') {
  const db = createAdminClient();
  if (await alreadyRunning(db)) {
    return NextResponse.json({ ok: true, docs: 0, lines: 0, message: 'Синхронизация уже идёт, данные скоро обновятся.' });
  }
  const before = await readHealth(db);
  const response = await run(db, trigger);
  // Сбой или восстановление загрузки — сообщение руководителю (ошибка Telegram не мешает синхронизации)
  try {
    for (const text of healthAlerts(before, await readHealth(db), SITE_URL)) await notify(db, text);
  } catch (e) {
    console.log('[sync-health]', (e as Error).message);
  }
  return response;
}

async function readHealth(db: ReturnType<typeof createAdminClient>): Promise<Map<HealthKey, HealthState>> {
  const { data } = await db.from('sync_state').select('key, ok, message').in('key', ['shipments', 'iiko']);
  return new Map((data ?? []).map((r) => [r.key as HealthKey, { ok: r.ok, message: r.message }]));
}

async function run(db: ReturnType<typeof createAdminClient>, trigger: 'manual' | 'cron') {
  const onec = makeOneCClient();
  const result = await runSync(db, trigger, onec);
  // Расходные на точки — после справочников; их сбой не мешает прайс-доске
  const shipments = result.ok ? await runShipmentsSync(db, onec) : null;
  const priceSettings = result.ok ? await runPriceSettingsSync(db, onec) : null;
  // 1С недоступна целиком — расходные тоже не обновились, отмечаем это для «Центра Питания»
  if (!result.ok) await db.from('sync_state').upsert({ key: 'shipments', at: new Date().toISOString(), ok: false, message: `1С: ${result.message}` });
  // Выручка из iiko не зависит от 1С; по расписанию — не чаще раза в 30 минут, по кнопке — сразу
  const iiko = await runIikoSync(db, trigger === 'manual').catch((e) => ({ ok: false, message: (e as Error).message }));
  return NextResponse.json({ ...result, shipments, priceSettings, iiko }, { status: result.ok ? 200 : 502 });
}

/** Расписание: Vercel Cron и Supabase pg_cron присылают Authorization: Bearer <CRON_SECRET>. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: 'Нет доступа' }, { status: 401 });
  }
  return handle('cron');
}

/** Кнопка «Обновить из 1С»: любой участник прайс-доски или «Центра Питания». */
export async function POST() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Войдите в аккаунт.' }, { status: 401 });
  const { data: profile } = await db.from('profiles').select('role, canteen_role').eq('id', user.id).maybeSingle();
  if (!profile?.role && !profile?.canteen_role) return NextResponse.json({ ok: false, message: 'Вы не в команде.' }, { status: 403 });
  return handle('manual');
}

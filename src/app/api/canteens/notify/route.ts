import { NextResponse, type NextRequest } from 'next/server';
import { SITE_URL } from '@/lib/alert-runner';
import { mskDay, mskMonth, summarize } from '@/lib/canteens';
import { customerMap, loadCanteens, loadReports, loadShipments } from '@/lib/canteens-data';
import { chatKey, reminderText, summaryText } from '@/lib/canteens-notify';
import { createAdminClient } from '@/lib/supabase/admin';
import { notify, sendTo, telegramConfigured } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * По расписанию (Vercel Cron, Authorization: Bearer <CRON_SECRET>):
 *  ?kind=reminder — в 21:00 по Москве админам точек, которые не сдали отчёт за сегодня;
 *  ?kind=summary  — утром руководителю в чат прайс-доски: сводка за вчера.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: 'Нет доступа' }, { status: 401 });
  }
  if (!telegramConfigured()) return NextResponse.json({ ok: false, message: 'Telegram не настроен.' });
  const kind = request.nextUrl.searchParams.get('kind');
  const db = createAdminClient();
  const canteens = await loadCanteens(db);

  if (kind === 'reminder') {
    const today = mskDay(Date.now());
    const { data: done } = await db.from('daily_reports').select('canteen_id').eq('report_date', today);
    const submitted = new Set((done ?? []).map((r) => r.canteen_id));
    const pending = canteens.filter((c) => !submitted.has(c.id));
    if (!pending.length) return NextResponse.json({ ok: true, message: 'Все отчёты сданы.', sent: 0 });

    // Админы с привязанным Telegram и их несданные точки
    const { data: admins } = await db.from('canteen_admins').select('user_id, canteen_id').in('canteen_id', pending.map((c) => c.id));
    const ids = [...new Set((admins ?? []).map((a) => a.user_id))];
    const { data: active } = ids.length ? await db.from('profiles').select('id').in('id', ids).not('canteen_role', 'is', null) : { data: [] as { id: string }[] };
    const allowed = new Set((active ?? []).map((p) => p.id));
    const byUser = new Map<string, string[]>();
    for (const a of admins ?? []) {
      if (!allowed.has(a.user_id)) continue;
      const name = pending.find((c) => c.id === a.canteen_id)?.name;
      if (name) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), name]);
    }
    if (!byUser.size) return NextResponse.json({ ok: true, message: 'Админам несданных точек некому писать.', sent: 0 });
    const { data: chats } = await db.from('app_settings').select('key, value').in('key', [...byUser.keys()].map(chatKey));
    let sent = 0;
    for (const c of chats ?? []) {
      const uid = c.key.slice('tg_chat:'.length);
      if (c.value && (await sendTo(c.value, reminderText(byUser.get(uid) ?? [], today, SITE_URL)))) sent++;
    }
    return NextResponse.json({ ok: true, message: `Напоминаний: ${sent}`, sent });
  }

  if (kind === 'summary') {
    const yesterday = mskDay(Date.now() - 86_400_000);
    const month = yesterday.slice(0, 7);
    const [shipments, reports] = await Promise.all([loadShipments(db, canteens, month), loadReports(db, canteens, month)]);
    const totals = summarize(canteens.map((c) => c.id), customerMap(canteens), shipments, reports);
    await notify(db, summaryText(yesterday, canteens, totals, SITE_URL));
    return NextResponse.json({ ok: true, message: `Сводка за ${yesterday} отправлена.`, month: month === mskMonth() ? 'current' : 'previous' });
  }

  return NextResponse.json({ ok: false, message: 'Укажите kind=reminder или kind=summary' }, { status: 400 });
}

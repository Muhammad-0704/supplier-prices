import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getChatId, notify, telegramConfigured } from '@/lib/telegram';
import { buildWeeklySummary } from '@/lib/weekly';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function send() {
  const db = createAdminClient();
  if (!telegramConfigured() || !(await getChatId(db))) {
    return NextResponse.json({ ok: false, message: 'Telegram не подключён: сначала нажмите «Подключить чат».' }, { status: 400 });
  }
  const text = await buildWeeklySummary(db);
  await notify(db, text);
  return NextResponse.json({ ok: true, message: 'Сводка отправлена в Telegram.' });
}

/** По расписанию: Vercel Cron по понедельникам, с Authorization: Bearer <CRON_SECRET>. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: 'Нет доступа' }, { status: 401 });
  }
  return send();
}

/** Кнопка «Отправить сводку сейчас» — только руководитель. */
export async function POST() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Войдите в аккаунт.' }, { status: 401 });
  const { data } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (data?.role !== 'manager') return NextResponse.json({ ok: false, message: 'Только для руководителя.' }, { status: 403 });
  return send();
}

import { NextResponse, type NextRequest } from 'next/server';
import { buildDigest } from '@/lib/order-digest';
import { loadOrder } from '@/lib/reorder-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getChatId, notify, telegramConfigured } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function send(force: boolean) {
  const db = createAdminClient();
  if (!telegramConfigured() || !(await getChatId(db))) {
    return NextResponse.json({ ok: false, message: 'Telegram не подключён.' }, { status: 400 });
  }
  const { rows, suppliers } = await loadOrder(db);
  const text = buildDigest(rows, suppliers);
  if (!text) {
    if (force) await notify(db, 'Сегодня заказывать нечего: по ритму закупок всего хватает.');
    return NextResponse.json({ ok: true, message: 'Заказывать нечего.' });
  }
  await notify(db, text);
  return NextResponse.json({ ok: true, message: 'Список отправлен в Telegram.' });
}

/** По расписанию (pg_cron), с Authorization: Bearer <CRON_SECRET>. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: 'Нет доступа' }, { status: 401 });
  }
  return send(false);
}

/** Проверочная отправка — только руководитель. */
export async function POST() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Войдите в аккаунт.' }, { status: 401 });
  const { data } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (data?.role !== 'manager') return NextResponse.json({ ok: false, message: 'Только для руководителя.' }, { status: 403 });
  return send(true);
}

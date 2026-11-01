import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findActiveTvLink, loadTvToday } from '@/lib/tv';

export const dynamic = 'force-dynamic';

/** Данные для экрана ТВ: без логина, по токену ссылки из «Доступов». Опрашивается с клиента раз в минуту. */
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const db = createAdminClient();
  const link = await findActiveTvLink(db, params.token);
  if (!link) return NextResponse.json({ ok: false, message: 'Ссылка недействительна или отключена.' }, { status: 404 });

  void db.from('tv_links').update({ last_opened_at: new Date().toISOString(), open_count: link.open_count + 1 }).eq('id', link.id);

  const { day, points } = await loadTvToday(db);
  return NextResponse.json({
    ok: true,
    day,
    name: link.name,
    points: points.map((p) => ({ id: p.id, name: p.name, revenue: p.revenue, foodcost: p.foodcost, buy: p.buy, meat: p.meat })),
  });
}

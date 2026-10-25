import { NextResponse, type NextRequest } from 'next/server';
import { compareToOurs, findActiveLink, ourBestPrices, scopeItems, validatePayload } from '@/lib/offers';
import { createAdminClient } from '@/lib/supabase/admin';
import { esc, notify } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

const MAX_PER_HOUR = 12;

/** Приём предложения от поставщика. Ответ содержит только «ниже / на уровне / выше» — без наших цифр. */
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const db = createAdminClient();
  const link = await findActiveLink(db, params.token);
  if (!link) return NextResponse.json({ error: 'Ссылка недействительна или отключена.' }, { status: 404 });

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from('offer_submissions').select('id', { count: 'exact', head: true }).eq('link_id', link.id).gte('created_at', hourAgo);
  if ((count ?? 0) >= MAX_PER_HOUR) return NextResponse.json({ error: 'Слишком много отправок за час. Попробуйте позже.' }, { status: 429 });

  const raw = await request.json().catch(() => null);
  const items = await scopeItems(db, link);
  const byId = new Map(items.map((i) => [i.id, i]));
  const v = validatePayload(raw, new Set(byId.keys()));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const { data: sub, error } = await db.from('offer_submissions').insert({ link_id: link.id, contact: v.value.contact ?? null, comment: v.value.comment ?? null }).select('id').single();
  if (error || !sub) return NextResponse.json({ error: 'Не удалось сохранить. Попробуйте ещё раз.' }, { status: 500 });

  const rows = v.value.lines.map((l) => ({
    submission_id: sub.id, link_id: link.id, item_id: l.itemId ?? null, custom_name: l.customName ?? null,
    unit: l.itemId ? byId.get(l.itemId)?.unit ?? null : l.unit ?? null, price: l.price,
    min_qty: null, valid_until: l.validUntil ?? null, comment: l.comment ?? null,
  }));
  const { error: lerr } = await db.from('offer_lines').insert(rows);
  if (lerr) {
    await db.from('offer_submissions').delete().eq('id', sub.id);
    return NextResponse.json({ error: 'Не удалось сохранить цены. Попробуйте ещё раз.' }, { status: 500 });
  }

  const ours = await ourBestPrices(db, v.value.lines.filter((l) => l.itemId).map((l) => l.itemId!));
  const result = v.value.lines.map((l) => ({
    itemId: l.itemId,
    name: l.itemId ? byId.get(l.itemId)!.name : l.customName!,
    price: l.price,
    compare: l.itemId ? compareToOurs(l.price, ours.get(l.itemId)) : ('unknown' as const),
  }));

  const lower = result.filter((r) => r.compare === 'lower');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const lines = [
    `<b>Новое предложение цен: ${esc(link.company_name)}</b>`,
    `Позиций: ${result.length}${lower.length ? `, дешевле нашей цены: <b>${lower.length}</b>` : ''}`,
    ...lower.slice(0, 8).map((r) => `• ${esc(r.name)}: ${r.price} ₽ (у нас ${ours.get(r.itemId!)} ₽)`),
    v.value.contact ? `Контакт: ${esc(v.value.contact)}` : '',
    host ? `https://${host}/offers` : '',
  ].filter(Boolean);
  await notify(db, lines.join('\n'));

  // Сравнение показываем поставщику, только если ссылка это разрешает
  return NextResponse.json({ ok: true, reveal: link.reveal, lines: link.reveal === 'none' ? result.map((r) => ({ ...r, compare: 'unknown' as const })) : result });
}

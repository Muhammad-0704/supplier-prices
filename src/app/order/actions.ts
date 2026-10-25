'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

async function requireMember() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('Войдите в аккаунт.');
  const { data } = await db.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!data) throw new Error('Вас ещё не добавили в команду.');
  return { db, user };
}

export type ActionResult = { ok?: string; error?: string };

/** Пересчёт склада: фактическое количество по нескольким товарам за раз. */
export async function saveCounts(entries: { itemId: string; qty: number }[]): Promise<ActionResult> {
  try {
    const { db, user } = await requireMember();
    const rows = entries
      .filter((e) => e.itemId && Number.isFinite(e.qty) && e.qty >= 0 && e.qty < 1e9)
      .slice(0, 500)
      .map((e) => ({ item_id: e.itemId, qty: Math.round(e.qty * 1000) / 1000, counted_by: user.id }));
    if (!rows.length) return { error: 'Введите количество хотя бы по одному товару.' };
    const { error } = await db.from('stock_counts').insert(rows);
    if (error) return { error: `Не удалось сохранить: ${error.message}` };
    // После пересчёта отметка «отложить» больше не нужна: решение теперь по факту
    await db.from('reorder_marks').delete().in('item_id', rows.map((r) => r.item_id)).eq('status', 'snoozed');
    revalidatePath('/order');
    return { ok: `Пересчёт сохранён: ${rows.length} поз.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** «Заказано» или «Отложить на N дней». */
export async function setMark(itemIds: string[], status: 'ordered' | 'snoozed', days = 7): Promise<ActionResult> {
  try {
    const { db, user } = await requireMember();
    const ids = itemIds.filter(Boolean).slice(0, 500);
    if (!ids.length) return {};
    const now = new Date();
    const until = status === 'snoozed' ? new Date(now.getTime() + Math.min(Math.max(days, 1), 90) * 86_400_000).toISOString() : null;
    const { error } = await db.from('reorder_marks').upsert(ids.map((item_id) => ({ item_id, status, until, marked_by: user.id, marked_at: now.toISOString() })));
    if (error) return { error: error.message };
    revalidatePath('/order');
    return { ok: status === 'ordered' ? `Отмечено заказанным: ${ids.length} поз.` : `Отложено на ${days} дн.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function clearMark(itemId: string): Promise<ActionResult> {
  try {
    const { db } = await requireMember();
    const { error } = await db.from('reorder_marks').delete().eq('item_id', itemId);
    if (error) return { error: error.message };
    revalidatePath('/order');
    return { ok: 'Отметка снята.' };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

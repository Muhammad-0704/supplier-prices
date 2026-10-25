'use server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { newToken, type OfferScope } from '@/lib/offers';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { connectTelegram } from '@/lib/telegram';

async function requireManager() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('Войдите в аккаунт.');
  const { data } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (data?.role !== 'manager') throw new Error('Только руководитель может управлять предложениями.');
  return { db, user };
}

function origin() {
  const h = headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || 'https';
  return host ? `${proto}://${host}` : '';
}

export type CreateLinkState = { ok?: string; url?: string; error?: string } | null;

export async function createLink(_prev: CreateLinkState, form: FormData): Promise<CreateLinkState> {
  try {
    const { db, user } = await requireManager();
    const supplierId = String(form.get('supplier_id') || '') || null;
    let company = String(form.get('company_name') || '').trim();
    const scope = String(form.get('scope') || '') as OfferScope;
    const categories = form.getAll('categories').map(String).filter(Boolean);
    const itemIds = form.getAll('item_ids').map(String).filter(Boolean);
    const days = Number(form.get('expires_days') || 0);
    const note = String(form.get('note') || '').trim().slice(0, 500) || null;

    if (supplierId && !company) {
      const { data } = await db.from('suppliers').select('name').eq('id', supplierId).single();
      company = data?.name ?? '';
    }
    if (!company) return { error: 'Выберите поставщика или впишите название фирмы.' };
    if (!['supplier_items', 'categories', 'items'].includes(scope)) return { error: 'Выберите, какие товары увидит поставщик.' };
    if (scope === 'supplier_items' && !supplierId) return { error: '«Товары, которые мы у него берём» доступно только для поставщика из 1С.' };
    if (scope === 'categories' && !categories.length) return { error: 'Отметьте хотя бы один раздел.' };
    if (scope === 'items' && !itemIds.length) return { error: 'Отметьте хотя бы один товар.' };

    const token = newToken();
    const { error } = await db.from('offer_links').insert({
      token, supplier_id: supplierId, company_name: company.slice(0, 200), scope,
      categories: scope === 'categories' ? categories : [], item_ids: scope === 'items' ? itemIds : [],
      expires_at: days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null, note, created_by: user.id,
    });
    if (error) return { error: `Не удалось создать ссылку: ${error.message}` };
    revalidatePath('/offers');
    return { ok: `Ссылка для «${company}» готова. Скопируйте и отправьте её поставщику.`, url: `${origin()}/o/${token}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function setLinkActive(form: FormData) {
  const { db } = await requireManager();
  await db.from('offer_links').update({ active: form.get('active') === 'true' }).eq('id', String(form.get('id')));
  revalidatePath('/offers');
}

export async function setLineStatus(form: FormData) {
  const { db, user } = await requireManager();
  const status = String(form.get('status'));
  if (!['new', 'accepted', 'rejected'].includes(status)) return;
  const ids = String(form.get('ids') || '').split(',').map(Number).filter(Boolean);
  if (!ids.length) return;
  await db.from('offer_lines').update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).in('id', ids);
  revalidatePath('/offers');
  revalidatePath('/');
}

export type TgState = { ok?: string; error?: string } | null;
export async function connectTelegramAction(): Promise<TgState> {
  try {
    await requireManager();
    // app_settings пишет руководитель; используем серверный клиент, чтобы прочитать getUpdates и сохранить чат
    const r = await connectTelegram(createAdminClient());
    return r.ok ? { ok: r.message } : { error: r.message };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

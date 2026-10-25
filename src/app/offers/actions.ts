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

export type ThresholdState = { ok?: string; error?: string } | null;
/** Пороги сигналов о ценах, в процентах */
export async function saveThresholds(_prev: ThresholdState, form: FormData): Promise<ThresholdState> {
  try {
    const { db } = await requireManager();
    const up = Number(String(form.get('up') || '').replace(',', '.'));
    const down = Number(String(form.get('down') || '').replace(',', '.'));
    if (!(up >= 1 && up <= 90) || !(down >= 1 && down <= 90)) return { error: 'Укажите проценты от 1 до 90.' };
    const now = new Date().toISOString();
    const { error } = await db.from('app_settings').upsert([
      { key: 'alert_up_pct', value: String(up), updated_at: now },
      { key: 'alert_down_pct', value: String(down), updated_at: now },
    ]);
    if (error) return { error: error.message };
    revalidatePath('/offers');
    return { ok: `Сохранено: подорожание от ${up}%, подешевление от ${down}%.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export interface ImportLine { itemId: string | null; name: string; unit: string | null; price: number; note: string | null }
export type ImportState = { ok?: string; error?: string };

/**
 * Прайс поставщика из файла → предложение в разделе «Предложения».
 * Сохраняется под служебной (выключенной) ссылкой этой фирмы, чтобы история и доска работали как с обычными предложениями.
 */
export async function importPriceList(payload: { supplierId: string | null; company: string; fileName: string; validUntil: string | null; lines: ImportLine[] }): Promise<ImportState> {
  try {
    const { db, user } = await requireManager();
    const supplierId = payload.supplierId || null;
    let company = payload.company.trim().slice(0, 200);
    if (supplierId && !company) {
      const { data } = await db.from('suppliers').select('name').eq('id', supplierId).single();
      company = data?.name ?? '';
    }
    if (!company) return { error: 'Выберите поставщика или впишите название фирмы.' };
    const validUntil = payload.validUntil && /^\d{4}-\d{2}-\d{2}$/.test(payload.validUntil) ? payload.validUntil : null;

    const lines = payload.lines
      .filter((l) => Number.isFinite(l.price) && l.price > 0 && l.price < 1e10 && (l.itemId || l.name.trim()))
      .slice(0, 3000)
      .map((l) => ({
        item_id: l.itemId || null,
        custom_name: l.itemId ? null : l.name.trim().slice(0, 300),
        unit: l.unit?.slice(0, 20) || null,
        price: Math.round(l.price * 100) / 100,
        comment: l.note?.slice(0, 500) || null,
        valid_until: validUntil,
      }));
    if (!lines.length) return { error: 'Отметьте хотя бы одну строку прайса.' };

    // Ссылка этой фирмы: последняя существующая или новая выключенная
    let q = db.from('offer_links').select('id').order('created_at', { ascending: false }).limit(1);
    q = supplierId ? q.eq('supplier_id', supplierId) : q.is('supplier_id', null).ilike('company_name', company.replace(/[%_\\]/g, '\\$&'));
    const { data: found } = await q;
    let linkId = found?.[0]?.id as string | undefined;
    if (!linkId) {
      const itemIds = [...new Set(lines.map((l) => l.item_id).filter(Boolean) as string[])];
      const { data: created, error } = await db.from('offer_links').insert({
        token: newToken(), supplier_id: supplierId, company_name: company, scope: 'items', item_ids: itemIds,
        active: false, note: 'Создана при загрузке прайса из файла', created_by: user.id,
      }).select('id').single();
      if (error || !created) return { error: `Не удалось сохранить: ${error?.message}` };
      linkId = created.id;
    }

    // Отправки пишет только сервер (у команды нет права вставлять их напрямую)
    const admin = createAdminClient();
    const { data: sub, error: subErr } = await admin.from('offer_submissions')
      .insert({ link_id: linkId, source: 'file', file_name: payload.fileName.slice(0, 200), comment: `Загрузил ${user.email ?? 'руководитель'}` })
      .select('id').single();
    if (subErr || !sub) return { error: `Не удалось сохранить: ${subErr?.message}` };
    for (let i = 0; i < lines.length; i += 500) {
      const { error } = await admin.from('offer_lines').insert(lines.slice(i, i + 500).map((l) => ({ ...l, submission_id: sub.id, link_id: linkId })));
      if (error) {
        await admin.from('offer_submissions').delete().eq('id', sub.id);
        return { error: `Не удалось сохранить строки: ${error.message}` };
      }
    }
    revalidatePath('/offers');
    revalidatePath('/');
    const matched = lines.filter((l) => l.item_id).length;
    return { ok: `Прайс «${company}» сохранён: ${lines.length} строк, из них с нашими товарами ${matched}.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

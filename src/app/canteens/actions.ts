'use server';
import { revalidatePath } from 'next/cache';
import { canEditDay, parseMoney } from '@/lib/canteens';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ensureAccount } from '@/lib/users';

export type ActionState = { ok?: string; error?: string } | null;

async function me() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('Войдите в аккаунт.');
  const { data } = await db.from('profiles').select('canteen_role').eq('id', user.id).maybeSingle();
  if (!data?.canteen_role) throw new Error('Нет доступа к «Столовым».');
  return { db, user, manager: data.canteen_role === 'manager' };
}

/** Ежедневный отчёт точки: наличные и безнал за день. Повторная отправка исправляет отчёт. */
export async function saveReport(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, user, manager } = await me();
    const canteenId = String(form.get('canteen_id') || '');
    const day = String(form.get('report_date') || '');
    const cash = parseMoney(form.get('cash'));
    const card = parseMoney(form.get('card'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: 'Выберите дату.' };
    if (cash == null || card == null) return { error: 'Суммы — числом, например 12500 или 12500,50.' };
    if (!canEditDay(day, manager)) return { error: manager ? 'Отчёт за будущий день сдать нельзя.' : 'Сдать или исправить можно отчёт за сегодня и вчера. За более ранний день — попросите руководителя.' };

    const { data: existing } = await db.from('daily_reports').select('id').eq('canteen_id', canteenId).eq('report_date', day).maybeSingle();
    const now = new Date().toISOString();
    const { error } = existing
      ? await db.from('daily_reports').update({ cash, card, updated_by: user.id, updated_at: now }).eq('id', existing.id)
      : await db.from('daily_reports').insert({ canteen_id: canteenId, report_date: day, cash, card, created_by: user.id, updated_by: user.id });
    if (error) return { error: error.message.includes('row-level security') ? 'Нет права сдавать отчёт за эту точку или эту дату.' : `Не сохранилось: ${error.message}` };
    revalidatePath('/canteens', 'layout');
    return { ok: existing ? 'Отчёт исправлен.' : 'Отчёт сохранён.' };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function manager() {
  const m = await me();
  if (!m.manager) throw new Error('Только руководитель управляет доступами.');
  return m;
}

/** Новый человек в «Столовых» (или существующий аккаунт другого сервиса) с ролью и точками. */
export async function addCanteenUser(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await manager();
    const email = String(form.get('email') || '').trim().toLowerCase();
    const fullName = String(form.get('full_name') || '').trim();
    const password = String(form.get('password') || '');
    const role = form.get('canteen_role') === 'manager' ? 'manager' : 'admin';
    const points = form.getAll('canteen_id').map(String).filter(Boolean);
    if (!email || !fullName) return { error: 'Заполните имя и почту.' };
    if (password.length < 8) return { error: 'Пароль должен быть не короче 8 символов.' };
    if (role === 'admin' && !points.length) return { error: 'Отметьте точки, за которые отвечает админ.' };

    const admin = createAdminClient();
    const acc = await ensureAccount(admin, email, password, fullName);
    if (acc.created) {
      // Новый аккаунт: только «Столовые», прайс-доска закрыта
      const { error } = await admin.from('profiles').upsert({ id: acc.id, full_name: fullName, role: null, canteen_role: role });
      if (error) return { error: `Профиль: ${error.message}` };
    } else {
      const { error } = await admin.from('profiles').upsert({ id: acc.id, canteen_role: role });
      if (error) return { error: `Профиль: ${error.message}` };
    }
    await admin.from('canteen_admins').delete().eq('user_id', acc.id);
    if (role === 'admin') await admin.from('canteen_admins').insert(points.map((canteen_id) => ({ user_id: acc.id, canteen_id })));
    revalidatePath('/canteens/access');
    return { ok: acc.created ? `${fullName} добавлен. Передайте почту и пароль — войти можно сразу.` : `У ${email} уже есть аккаунт: открыли «Столовые». Пароль прежний.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Поменять точки админа или его роль. */
export async function updateCanteenUser(form: FormData) {
  const { user } = await manager();
  const id = String(form.get('user_id') || '');
  const role = form.get('canteen_role') === 'manager' ? 'manager' : 'admin';
  if (id === user.id && role !== 'manager') return; // руководитель не снимает роль с самого себя
  const points = form.getAll('canteen_id').map(String).filter(Boolean);
  const admin = createAdminClient();
  await admin.from('profiles').update({ canteen_role: role }).eq('id', id);
  await admin.from('canteen_admins').delete().eq('user_id', id);
  if (role === 'admin' && points.length) await admin.from('canteen_admins').insert(points.map((canteen_id) => ({ user_id: id, canteen_id })));
  revalidatePath('/canteens/access');
}

/** Закрыть «Столовые» человеку. Аккаунт не удаляется: он мог работать и в прайс-доске. */
export async function revokeCanteenUser(form: FormData) {
  const { user } = await manager();
  const id = String(form.get('user_id') || '');
  if (id === user.id) return;
  const admin = createAdminClient();
  await admin.from('canteen_admins').delete().eq('user_id', id);
  await admin.from('profiles').update({ canteen_role: null }).eq('id', id);
  revalidatePath('/canteens/access');
}

/** Какой покупатель 1С — какая точка. */
export async function linkCustomer(form: FormData) {
  const { db } = await manager();
  const customerId = String(form.get('customer_id') || '');
  const canteenId = String(form.get('canteen_id') || '');
  if (!customerId) return;
  if (canteenId) await db.from('canteen_customers').upsert({ customer_id: customerId, canteen_id: canteenId });
  else await db.from('canteen_customers').delete().eq('customer_id', customerId);
  revalidatePath('/canteens', 'layout');
}

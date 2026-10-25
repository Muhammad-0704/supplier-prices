'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type ActionState = { ok?: string; error?: string } | null;

async function requireManager() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('Войдите в аккаунт.');
  const { data } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (data?.role !== 'manager') throw new Error('Только руководитель может управлять командой.');
  return user;
}

/** Создаёт сотрудника с временным паролем: письма не нужны, пароль руководитель передаёт сам. */
export async function addMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireManager();
    const email = String(form.get('email') || '').trim().toLowerCase();
    const fullName = String(form.get('full_name') || '').trim();
    const password = String(form.get('password') || '');
    const role = form.get('role') === 'manager' ? 'manager' : 'staff';
    if (!email || !fullName) return { error: 'Заполните имя и почту.' };
    if (password.length < 8) return { error: 'Пароль должен быть не короче 8 символов.' };

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error) return { error: error.message.includes('already') ? 'Сотрудник с такой почтой уже есть.' : `Не удалось создать: ${error.message}` };
    await admin.from('profiles').upsert({ id: data.user.id, full_name: fullName, role });
    revalidatePath('/settings');
    return { ok: `${fullName} добавлен. Передайте ему почту и пароль, войти можно сразу.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function setRole(form: FormData) {
  const me = await requireManager();
  const id = String(form.get('id'));
  const role = form.get('role') === 'manager' ? 'manager' : 'staff';
  if (id === me.id && role !== 'manager') return; // нельзя снять роль с самого себя и остаться без руководителя
  const db = createClient();
  await db.from('profiles').update({ role }).eq('id', id);
  revalidatePath('/settings');
}

export async function removeMember(form: FormData) {
  const me = await requireManager();
  const id = String(form.get('id'));
  if (id === me.id) return;
  await createAdminClient().auth.admin.deleteUser(id);
  revalidatePath('/settings');
}

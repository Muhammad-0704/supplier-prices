'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

async function requireManager() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('Войдите в аккаунт.');
  const { data } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (data?.role !== 'manager') throw new Error('Только руководитель может менять заявку.');
  return { db, user };
}

/** Убрать поставщика из заявки или вернуть его. */
export async function setSkipRequest(form: FormData) {
  const { db, user } = await requireManager();
  const supplierId = String(form.get('supplier_id') || '');
  if (!supplierId) return;
  const skip = form.get('skip') === 'true';
  const note = String(form.get('note') || '').trim().slice(0, 200) || null;
  await db.from('supplier_flags').upsert({ supplier_id: supplierId, skip_request: skip, note: skip ? note : null, updated_by: user.id, updated_at: new Date().toISOString() });
  revalidatePath('/settings');
  revalidatePath('/order');
}

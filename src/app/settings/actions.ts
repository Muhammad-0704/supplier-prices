'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { connectTelegram } from '@/lib/telegram';

async function requireManager() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('Войдите в аккаунт.');
  const { data } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (data?.role !== 'manager') throw new Error('Только руководитель может менять настройки.');
  return { db, user };
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
    revalidatePath('/settings');
    return { ok: `Сохранено: подорожание от ${up}%, подешевление от ${down}%.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

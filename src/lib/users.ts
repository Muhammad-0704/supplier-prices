import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Найти аккаунт по почте (у Supabase нет прямого поиска; людей в команде немного). */
export async function findUserByEmail(admin: SupabaseClient, email: string): Promise<{ id: string } | null> {
  const want = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Список аккаунтов: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === want);
    if (hit) return { id: hit.id };
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Один аккаунт на человека: создаёт его с временным паролем или, если почта уже есть
 * (человек работает в другом сервисе), возвращает существующий. Пароль существующего не меняется.
 */
export async function ensureAccount(admin: SupabaseClient, email: string, password: string, fullName: string): Promise<{ id: string; created: boolean }> {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (!error && data.user) return { id: data.user.id, created: true };
  if (error && /already|exists|registered/i.test(error.message)) {
    const found = await findUserByEmail(admin, email);
    if (found) return { id: found.id, created: false };
  }
  throw new Error(`Не удалось создать аккаунт: ${error?.message ?? 'неизвестная ошибка'}`);
}

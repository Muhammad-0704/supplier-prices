import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Клиент с правами service role: обходит RLS. Только для синхронизации с 1С
 * и управления пользователями на сервере. Никогда не импортируйте в клиентский код.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Не заданы NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

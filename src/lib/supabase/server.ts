import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Клиент Supabase от имени вошедшего пользователя: права ограничены RLS. */
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Вызов из серверного компонента: куки обновит middleware
        }
      },
    },
  });
}

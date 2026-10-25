'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signIn(_prev: { error: string } | null, form: FormData): Promise<{ error: string } | null> {
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  if (!email || !password) return { error: 'Введите почту и пароль.' };

  const db = createClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: error.message.includes('Invalid login') ? 'Неверная почта или пароль.' : `Не удалось войти: ${error.message}` };
  }
  redirect('/');
}

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Уведомления в Telegram. Токен бота лежит в переменной TELEGRAM_BOT_TOKEN (Vercel, тип Sensitive),
 * id чата сохраняется в app_settings после нажатия «Подключить» на странице «Предложения».
 */
const API = 'https://api.telegram.org';

export function telegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

async function call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Не задан TELEGRAM_BOT_TOKEN');
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(json.description || `Telegram ответил ${res.status}`);
  return json.result as T;
}

export async function getChatId(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.from('app_settings').select('value').eq('key', 'telegram_chat_id').maybeSingle();
  return data?.value ?? null;
}

/** Находит чат, где боту недавно написали /start, сохраняет его и шлёт проверочное сообщение. */
export async function connectTelegram(db: SupabaseClient): Promise<{ ok: boolean; message: string }> {
  if (!telegramConfigured()) return { ok: false, message: 'Сначала добавьте TELEGRAM_BOT_TOKEN в настройки Vercel.' };
  type Update = { message?: { chat: { id: number; title?: string; first_name?: string }; text?: string } };
  const updates = await call<Update[]>('getUpdates', { limit: 50, allowed_updates: ['message'] });
  const last = [...updates].reverse().find((u) => u.message?.chat?.id);
  if (!last?.message) return { ok: false, message: 'Бот ещё не получал сообщений. Откройте бота в Telegram, нажмите «Старт» и попробуйте снова.' };
  const chatId = String(last.message.chat.id);
  await db.from('app_settings').upsert({ key: 'telegram_chat_id', value: chatId, updated_at: new Date().toISOString() });
  await call('sendMessage', { chat_id: chatId, text: 'Прайс-доска подключена. Сюда будут приходить новые предложения цен от поставщиков.' });
  return { ok: true, message: `Подключено: ${last.message.chat.title || last.message.chat.first_name || chatId}` };
}

/** Отправка уведомления. Ошибки не мешают поставщику: предложение уже сохранено. */
export async function notify(db: SupabaseClient, text: string): Promise<void> {
  try {
    if (!telegramConfigured()) return;
    const chatId = await getChatId(db);
    if (!chatId) return;
    await call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
  } catch (e) {
    console.log('[telegram]', (e as Error).message);
  }
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

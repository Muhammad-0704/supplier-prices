import { redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { loadThresholds } from '@/lib/alert-runner';
import { createClient } from '@/lib/supabase/server';
import { getChatId, telegramConfigured } from '@/lib/telegram';
import { AlertSettings } from './AlertSettings';
import { OrderDigestCard } from './OrderDigestCard';
import { TelegramConnect } from './TelegramConnect';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await db.from('profiles').select('role, full_name').eq('id', user.id).single();
  if (me?.role !== 'manager') redirect('/');
  const [chatId, th] = await Promise.all([getChatId(db), loadThresholds(db)]);
  const connected = telegramConfigured() && !!chatId;

  return (
    <main className="page">
      <Header role="manager" userName={me.full_name || ''} current="settings" />
      <div className="settings">
        <TelegramConnect configured={telegramConfigured()} connected={!!chatId} />
        <AlertSettings up={Math.round(th.up * 100)} down={Math.round(th.down * 100)} connected={connected} />
        <OrderDigestCard connected={connected} />
      </div>
    </main>
  );
}

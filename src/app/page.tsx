import { redirect } from 'next/navigation';
import { Board } from '@/components/Board';
import { Header } from '@/components/Header';
import { loadBoard } from '@/lib/board';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await db.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!profile) {
    return (
      <main className="page">
        <div className="notice notice--error">Ваш аккаунт ещё не добавлен в команду. Попросите руководителя добавить вас на странице «Команда».</div>
      </main>
    );
  }

  const data = await loadBoard(db, user.id);
  return (
    <main className="page">
      <Header role={data.role} userName={data.userName} current="board" />
      <Board data={data} />
    </main>
  );
}

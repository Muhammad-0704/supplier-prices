import { Board } from '@/components/Board';
import { Header } from '@/components/Header';
import { requirePrice } from '@/lib/access';
import { loadBoard } from '@/lib/board';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  const me = await requirePrice();
  const data = await loadBoard(createClient(), me.userId);
  return (
    <main className="page">
      <Header role={data.role} userName={data.userName} current="board" />
      <Board data={data} />
    </main>
  );
}

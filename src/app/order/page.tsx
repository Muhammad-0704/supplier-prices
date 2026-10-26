import { redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { loadOrder } from '@/lib/reorder-data';
import { createClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/types';
import { OrderBoard } from './OrderBoard';

export const dynamic = 'force-dynamic';

export default async function OrderPage() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await db.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
  if (!me) redirect('/');
  const role: Role = me.role === 'manager' ? 'manager' : 'staff';
  const data = await loadOrder(db);

  return (
    <main className="page">
      <Header role={role} userName={me.full_name || ''} current="order" />
      <OrderBoard rows={data.rows} suppliers={data.suppliers} skipped={data.skipped} manager={role === 'manager'} />
    </main>
  );
}

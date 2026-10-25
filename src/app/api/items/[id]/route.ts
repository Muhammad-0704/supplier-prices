import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { HistoryPoint } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** История закупочных цен товара за 180 дней, включая склеенные с ним карточки. Права проверяет RLS. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ history: [] }, { status: 401 });

  const { data: merged } = await db.from('items').select('id').eq('merged_into', params.id);
  const ids = [params.id, ...(merged ?? []).map((m) => m.id)];
  const since = new Date(Date.now() - 180 * 86_400_000).toISOString();

  const { data, error } = await db
    .from('purchases')
    .select('supplier_id, doc_date, price, doc_number')
    .in('item_id', ids)
    .gte('doc_date', since)
    .order('doc_date');
  if (error) return NextResponse.json({ history: [], error: error.message }, { status: 500 });

  const history: HistoryPoint[] = (data ?? []).map((r) => ({ supplierId: r.supplier_id, date: r.doc_date, price: Number(r.price), docNumber: r.doc_number }));
  return NextResponse.json({ history });
}

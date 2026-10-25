import type { Metadata } from 'next';
import { findActiveLink, scopeItems } from '@/lib/offers';
import { createAdminClient } from '@/lib/supabase/admin';
import { OfferForm } from './OfferForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Запрос цен', robots: { index: false, follow: false } };

/** Страница поставщика по персональной ссылке. Без входа: доступ даёт только токен ссылки. */
export default async function OfferPage({ params }: { params: { token: string } }) {
  const db = createAdminClient();
  const link = await findActiveLink(db, params.token);
  if (!link) {
    return (
      <main className="auth">
        <div className="auth__box">
          <h1>Ссылка недействительна</h1>
          <p className="muted" style={{ margin: 0 }}>Ссылка отключена, истекла или набрана с ошибкой. Попросите новую у того, кто её прислал.</p>
        </div>
      </main>
    );
  }

  await db.from('offer_links').update({ open_count: link.open_count + 1, last_opened_at: new Date().toISOString() }).eq('id', link.id);
  const items = await scopeItems(db, link);

  // Свои прошлые цены поставщик видит, чужие — нет
  const { data: mine } = await db.from('offer_lines').select('item_id, price, created_at').eq('link_id', link.id).not('item_id', 'is', null).order('created_at', { ascending: false }).limit(2000);
  const lastMine: Record<string, number> = {};
  for (const m of mine ?? []) if (m.item_id && !(m.item_id in lastMine)) lastMine[m.item_id] = Number(m.price);

  return (
    <main className="page offer-page">
      <header className="top">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
          <div>
            <h1>Запрос цен</h1>
            <div className="brand__sub">для {link.company_name}</div>
          </div>
        </div>
      </header>
      <div className="notice">
        Укажите ваши цены на товары ниже. Заполнять все не обязательно, только те, что можете поставить. Отправлять можно несколько раз: мы увидим последние цены.
      </div>
      {link.note && <div className="card-box"><p style={{ margin: 0 }}>{link.note}</p></div>}
      <OfferForm token={params.token} items={items} lastMine={lastMine} />
    </main>
  );
}

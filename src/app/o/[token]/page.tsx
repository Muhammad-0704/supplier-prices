import type { Metadata } from 'next';
import { PriceLogo } from '@/components/Logos';
import { findActiveLink, ourBestPrices, scopeItems } from '@/lib/offers';
import { longDate, num } from '@/lib/format';
import { DECISION } from '@/lib/reveal';
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

  // Свои прошлые цены и наши решения по ним поставщик видит, чужие цены — нет
  const { data: mine } = await db.from('offer_lines').select('item_id, custom_name, price, status, created_at, reviewed_at').eq('link_id', link.id).order('created_at', { ascending: false }).limit(2000);
  type Status = keyof typeof DECISION;
  const lastMine: Record<string, { price: number; status: Status }> = {};
  const decisions: { key: string; name: string; price: number; status: Status; date: string }[] = [];
  const names = new Map(items.map((i) => [i.id, i.name]));
  const seen = new Set<string>();
  for (const m of mine ?? []) {
    const key = m.item_id ?? `c:${(m.custom_name ?? '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const status = m.status as Status;
    if (m.item_id) lastMine[m.item_id] = { price: Number(m.price), status };
    const name = m.item_id ? names.get(m.item_id) : m.custom_name;
    if (name) decisions.push({ key, name, price: Number(m.price), status, date: m.reviewed_at ?? m.created_at });
  }
  const decided = decisions.filter((d) => d.status !== 'new');
  // Нашу цену показываем, только если так настроена ссылка
  const ours = link.reveal === 'price' ? Object.fromEntries(await ourBestPrices(db, items.map((i) => i.id))) : null;

  return (
    <main className="page offer-page">
      <header className="top">
        <div className="brand">
          <PriceLogo size={32} />
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
      {decisions.length > 0 && (
        <section className="card-box">
          <h2>Решения по вашим ценам</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {decided.length ? `По ${decided.length} ${decided.length === 1 ? 'позиции' : 'позициям'} решение принято.` : 'Мы ещё рассматриваем ваши цены.'} Здесь ваша последняя цена по каждому товару.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="ot">
              <thead><tr><th>Товар</th><th className="r">Ваша цена</th><th className="r">Решение</th></tr></thead>
              <tbody>
                {decisions.slice(0, 100).map((d) => (
                  <tr key={d.key}>
                    <td>{d.name}</td>
                    <td className="r pr">{num(d.price)} ₽</td>
                    <td className="r"><span className={`pb-badge pb-badge--${DECISION[d.status].tone}`}>{DECISION[d.status].text}</span>{d.status !== 'new' && <div className="muted" style={{ fontSize: 12 }}>{longDate(d.date)}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <OfferForm token={params.token} items={items} lastMine={lastMine} ours={ours} reveal={link.reveal} />
    </main>
  );
}

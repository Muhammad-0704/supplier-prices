import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { Badge } from '@/components/ui';
import { longDate, num, rub, time } from '@/lib/format';
import { linkState, ourBestPrices, type OfferLink } from '@/lib/offers';
import { createClient } from '@/lib/supabase/server';
import { getChatId, telegramConfigured } from '@/lib/telegram';
import { CopyButton } from './CopyButton';
import { LinkForm } from './LinkForm';
import { TelegramConnect } from './TelegramConnect';
import { AlertSettings } from './AlertSettings';
import { loadThresholds } from '@/lib/alert-runner';
import { setLineStatus, setLinkActive } from './actions';

export const dynamic = 'force-dynamic';

const SCOPE_TEXT = { supplier_items: 'Товары, которые мы у него берём', categories: 'Разделы', items: 'Подборка товаров' } as const;
const STATUS = { new: { tone: 'role', text: 'новое' }, accepted: { tone: 'best', text: 'принято' }, rejected: { tone: 'neutral', text: 'отклонено' } } as const;

function origin() {
  // Ссылки строим от адреса сайта; на Vercel он стабилен
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://supplier-prices-ashy.vercel.app';
}

export default async function OffersPage({ searchParams }: { searchParams: { tab?: string } }) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await db.from('profiles').select('role, full_name').eq('id', user.id).single();
  if (me?.role !== 'manager') redirect('/');
  const tab = searchParams.tab === 'links' ? 'links' : 'offers';

  return (
    <main className="page">
      <Header role="manager" userName={me.full_name || ''} current="offers" />
      <nav className="tabs" aria-label="Разделы предложений">
        <Link href="/offers" aria-current={tab === 'offers' ? 'page' : undefined}>Предложения</Link>
        <Link href="/offers?tab=links" aria-current={tab === 'links' ? 'page' : undefined}>Ссылки для поставщиков</Link>
      </nav>
      {tab === 'offers' ? <OffersTab /> : <LinksTab />}
    </main>
  );
}

async function OffersTab() {
  const db = createClient();
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: subs } = await db.from('offer_submissions').select('id, link_id, contact, comment, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(60);
  if (!subs?.length) {
    return <div className="cards__note">Предложений пока нет. Создайте ссылку во вкладке «Ссылки для поставщиков» и отправьте её поставщику.</div>;
  }
  const subIds = subs.map((s) => s.id);
  const linkIds = [...new Set(subs.map((s) => s.link_id))];
  const [{ data: lines }, { data: links }] = await Promise.all([
    db.from('offer_lines').select('id, submission_id, item_id, custom_name, unit, price, min_qty, valid_until, status').in('submission_id', subIds).order('id'),
    db.from('offer_links').select('id, company_name').in('id', linkIds),
  ]);
  const itemIds = [...new Set((lines ?? []).map((l) => l.item_id).filter(Boolean) as string[])];
  const [{ data: items }, best] = await Promise.all([
    itemIds.length ? db.from('items').select('id, name, unit').in('id', itemIds) : Promise.resolve({ data: [] as { id: string; name: string; unit: string }[] }),
    ourBestPrices(db, itemIds),
  ]);
  const itemName = new Map((items ?? []).map((i) => [i.id, i]));
  const company = new Map((links ?? []).map((l) => [l.id, l.company_name]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {subs.map((s) => {
        const ls = (lines ?? []).filter((l) => l.submission_id === s.id);
        const newIds = ls.filter((l) => l.status === 'new').map((l) => l.id).join(',');
        const cheaper = ls.filter((l) => l.item_id && best.get(l.item_id) && Number(l.price) < best.get(l.item_id)!).length;
        return (
          <section key={s.id} className="sub-card">
            <div className="sub-card__head">
              <span><b>{company.get(s.link_id) ?? 'Поставщик'}</b> <span className="muted">· {longDate(s.created_at)}, {time(s.created_at)} · позиций {ls.length}{cheaper ? ` · дешевле нашей цены: ${cheaper}` : ''}</span></span>
              {newIds && (
                <span className="acts">
                  <form action={setLineStatus}><input type="hidden" name="ids" value={newIds} /><input type="hidden" name="status" value="accepted" /><button className="pb-btn pb-btn--sm" type="submit">Принять все новые</button></form>
                  <form action={setLineStatus}><input type="hidden" name="ids" value={newIds} /><input type="hidden" name="status" value="rejected" /><button className="pb-btn pb-btn--quiet pb-btn--sm" type="submit">Отклонить все</button></form>
                </span>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="ot">
                <thead><tr><th>Товар</th><th className="r">Предлагают</th><th className="r">Наша лучшая</th><th className="r">Разница</th><th>Статус</th><th /></tr></thead>
                <tbody>
                  {ls.map((l) => {
                    const it = l.item_id ? itemName.get(l.item_id) : null;
                    const ours = l.item_id ? best.get(l.item_id) : undefined;
                    const diff = ours ? (Number(l.price) - ours) / ours : null;
                    const st = STATUS[l.status as keyof typeof STATUS];
                    return (
                      <tr key={l.id}>
                        <td>
                          {it?.name ?? l.custom_name}{!it && <Badge>свой товар</Badge>}
                          <div className="muted" style={{ fontSize: 12 }}>за {it?.unit ?? l.unit ?? '—'}{l.min_qty ? ` · мин. партия ${l.min_qty}` : ''}{l.valid_until ? ` · до ${longDate(l.valid_until)}` : ''}</div>
                        </td>
                        <td className="r pr">{rub(Number(l.price))}</td>
                        <td className="r sm">{ours ? rub(ours) : '—'}</td>
                        <td className={`r ${diff != null && diff < -0.005 ? 'diff-lower' : diff != null && diff > 0.005 ? 'diff-higher' : ''}`}>{diff == null ? '—' : `${diff > 0 ? '+' : ''}${num(diff * 100)}%`}</td>
                        <td><Badge tone={st.tone}>{st.text}</Badge></td>
                        <td className="r">
                          <span className="acts" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                            {l.status !== 'accepted' && <form action={setLineStatus}><input type="hidden" name="ids" value={l.id} /><input type="hidden" name="status" value="accepted" /><button className="pb-btn pb-btn--sm" type="submit">Принять</button></form>}
                            {l.status !== 'rejected' && <form action={setLineStatus}><input type="hidden" name="ids" value={l.id} /><input type="hidden" name="status" value="rejected" /><button className="pb-btn pb-btn--quiet pb-btn--sm" type="submit">Отклонить</button></form>}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(s.contact || s.comment) && <div className="sub-card__foot">{s.contact && <>Контакт: {s.contact}. </>}{s.comment}</div>}
          </section>
        );
      })}
    </div>
  );
}

async function LinksTab() {
  const db = createClient();
  const [{ data: links }, { data: suppliers }, { data: itemRows }, { data: subs }, chatId] = await Promise.all([
    db.from('offer_links').select('*').order('created_at', { ascending: false }),
    db.from('supplier_usage').select('supplier_id, docs_90d, docs_total').order('docs_90d', { ascending: false }),
    db.from('items').select('id, name, category').is('merged_into', null).order('category').order('name').range(0, 4999),
    db.from('offer_submissions').select('link_id, created_at').order('created_at', { ascending: false }).limit(2000),
    getChatId(db),
  ]);
  const th = await loadThresholds(db);
  const { data: supNames } = await db.from('suppliers').select('id, name');
  const nameById = new Map((supNames ?? []).map((s) => [s.id, s.name]));
  // Поставщики из 1С: сначала с накладными (по популярности), потом остальные по алфавиту
  const ranked = (suppliers ?? []).map((u) => ({ id: u.supplier_id, name: nameById.get(u.supplier_id) ?? '' })).filter((s) => s.name);
  const rankedIds = new Set(ranked.map((s) => s.id));
  const rest = (supNames ?? []).filter((s) => !rankedIds.has(s.id)).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const catCounts = new Map<string, number>();
  (itemRows ?? []).forEach((i) => catCounts.set(i.category, (catCounts.get(i.category) ?? 0) + 1));
  const subCount = new Map<string, { n: number; last: string }>();
  (subs ?? []).forEach((s) => { const c = subCount.get(s.link_id); subCount.set(s.link_id, { n: (c?.n ?? 0) + 1, last: c?.last ?? s.created_at }); });

  return (
    <>
      <LinkForm suppliers={[...ranked, ...rest]} categories={[...catCounts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'))} items={itemRows ?? []} />

      <section className="card-box">
        <h2>Созданные ссылки</h2>
        {!links?.length ? <p className="muted" style={{ margin: 0 }}>Ссылок пока нет.</p> : (links as OfferLink[]).map((l) => {
          const state = linkState(l);
          const url = `${origin()}/o/${l.token}`;
          const sc = subCount.get(l.id);
          const scopeDetail = l.scope === 'categories' ? `: ${l.categories.join(', ')}` : l.scope === 'items' ? `: ${l.item_ids.length} шт.` : '';
          return (
            <div key={l.id} className="link-row">
              <div style={{ minWidth: 0 }}>
                <b>{l.company_name}</b> {state === 'active' ? <Badge tone="best">действует</Badge> : state === 'expired' ? <Badge>истекла</Badge> : <Badge>отключена</Badge>}
                <div className="muted" style={{ fontSize: 13 }}>{SCOPE_TEXT[l.scope]}{scopeDetail}</div>
                <div className="link-url">{url}</div>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                Открывали: {l.open_count}{l.last_opened_at ? `, последний раз ${longDate(l.last_opened_at)} в ${time(l.last_opened_at)}` : ''}
                <br />Отправок: {sc?.n ?? 0}{sc ? `, последняя ${longDate(sc.last)}` : ''}
                {l.expires_at && <><br />До {longDate(l.expires_at)}</>}
              </div>
              <div className="acts" style={{ justifyContent: 'flex-end' }}>
                {state === 'active' && <CopyButton text={url} label="Скопировать" />}
                <form action={setLinkActive}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="active" value={l.active ? 'false' : 'true'} />
                  <button className="pb-btn pb-btn--quiet pb-btn--sm" type="submit">{l.active ? 'Отключить' : 'Включить'}</button>
                </form>
              </div>
            </div>
          );
        })}
      </section>

      <TelegramConnect configured={telegramConfigured()} connected={!!chatId} />
      <AlertSettings up={Math.round(th.up * 100)} down={Math.round(th.down * 100)} connected={telegramConfigured() && !!chatId} />
    </>
  );
}

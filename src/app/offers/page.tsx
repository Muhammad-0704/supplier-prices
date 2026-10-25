import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { Badge } from '@/components/ui';
import { longDate, num, rub, time } from '@/lib/format';
import { linkState, ourBestPrices, type OfferLink } from '@/lib/offers';
import { createClient } from '@/lib/supabase/server';
import { CopyButton } from './CopyButton';
import { LinkForm } from './LinkForm';
import { NewLinkToggle } from './NewLinkToggle';
import { RevealSelect } from './RevealSelect';
import { setLineStatus, setLinkActive } from './actions';
import { PriceImport } from './PriceImport';
import { loadBoard } from '@/lib/board';

export const dynamic = 'force-dynamic';

const SCOPE_TEXT = { supplier_items: 'Товары, которые мы у него берём', categories: 'Разделы', items: 'Подборка товаров' } as const;
const STATUS = { new: { tone: 'role', text: 'новое' }, accepted: { tone: 'best', text: 'принято' }, rejected: { tone: 'neutral', text: 'отклонено' } } as const;

function origin() {
  // Ссылки строим от адреса сайта; на Vercel он стабилен
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://supplier-prices-ashy.vercel.app';
}

export default async function OffersPage({ searchParams }: { searchParams: { tab?: string; view?: string } }) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await db.from('profiles').select('role, full_name').eq('id', user.id).single();
  if (me?.role !== 'manager') redirect('/');
  const tab = searchParams.tab === 'links' ? 'links' : searchParams.tab === 'import' ? 'import' : 'offers';

  return (
    <main className="page">
      <Header role="manager" userName={me.full_name || ''} current="offers" />
      <nav className="tabs" aria-label="Разделы предложений">
        <Link href="/offers" aria-current={tab === 'offers' ? 'page' : undefined}>Предложения</Link>
        <Link href="/offers?tab=import" aria-current={tab === 'import' ? 'page' : undefined}>Загрузить прайс</Link>
        <Link href="/offers?tab=links" aria-current={tab === 'links' ? 'page' : undefined}>Ссылки</Link>
      </nav>
      {tab === 'offers' ? <OffersTab archive={searchParams.view === 'archive'} /> : tab === 'import' ? <ImportTab userId={user.id} /> : <LinksTab />}
    </main>
  );
}

async function OffersTab({ archive }: { archive: boolean }) {
  const db = createClient();
  const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const { data: allSubs } = await db.from('offer_submissions').select('id, link_id, contact, comment, created_at, source, file_name').gte('created_at', since).order('created_at', { ascending: false }).limit(300);
  if (!allSubs?.length) {
    return <div className="cards__note">Предложений пока нет. Создайте ссылку во вкладке «Ссылки» и отправьте её поставщику.</div>;
  }
  const allIds = allSubs.map((s) => s.id);
  const { data: allLines } = await db.from('offer_lines').select('id, submission_id, item_id, custom_name, unit, price, min_qty, valid_until, status, comment').in('submission_id', allIds).order('id');
  // В архиве — предложения, по всем строкам которых уже принято решение
  const pending = new Set((allLines ?? []).filter((l) => l.status === 'new').map((l) => l.submission_id));
  const subs = allSubs.filter((s) => (archive ? !pending.has(s.id) : pending.has(s.id))).slice(0, 60);
  const nPending = allSubs.filter((s) => pending.has(s.id)).length;
  const viewNav = (
    <nav className="subtabs" aria-label="Какие предложения">
      <Link href="/offers" aria-current={!archive ? 'page' : undefined}>На рассмотрении <span className="num">{nPending}</span></Link>
      <Link href="/offers?view=archive" aria-current={archive ? 'page' : undefined}>Архив <span className="num">{allSubs.length - nPending}</span></Link>
    </nav>
  );
  if (!subs.length) {
    return <>{viewNav}<div className="cards__note">{archive ? 'В архиве пока пусто: сюда попадают предложения, по которым приняли решение.' : 'Новых предложений нет, по всем принято решение. Они в архиве.'}</div></>;
  }
  const linkIds = [...new Set(subs.map((s) => s.link_id))];
  const subIdSet = new Set(subs.map((s) => s.id));
  const lines = (allLines ?? []).filter((l) => subIdSet.has(l.submission_id));
  const { data: links } = await db.from('offer_links').select('id, company_name').in('id', linkIds);
  const itemIds = [...new Set(lines.map((l) => l.item_id).filter(Boolean) as string[])];
  const [{ data: items }, best] = await Promise.all([
    itemIds.length ? db.from('items').select('id, name, unit').in('id', itemIds) : Promise.resolve({ data: [] as { id: string; name: string; unit: string }[] }),
    ourBestPrices(db, itemIds),
  ]);
  const itemName = new Map((items ?? []).map((i) => [i.id, i]));
  const company = new Map((links ?? []).map((l) => [l.id, l.company_name]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {viewNav}
      {subs.map((s) => {
        const ls = lines.filter((l) => l.submission_id === s.id);
        const newIds = ls.filter((l) => l.status === 'new').map((l) => l.id).join(',');
        const cheaper = ls.filter((l) => l.item_id && best.get(l.item_id) && Number(l.price) < best.get(l.item_id)!).length;
        return (
          <section key={s.id} className="sub-card">
            <div className="sub-card__head">
              <span><b>{company.get(s.link_id) ?? 'Поставщик'}</b> {s.source === 'file' && <Badge>{s.file_name ? `файл ${s.file_name}` : 'из файла'}</Badge>} <span className="muted">· {longDate(s.created_at)}, {time(s.created_at)} · позиций {ls.length}{cheaper ? ` · дешевле нашей цены: ${cheaper}` : ''}</span></span>
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
                          {l.comment && <div className="muted" style={{ fontSize: 12 }}>{l.comment}</div>}
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

async function ImportTab({ userId }: { userId: string }) {
  const data = await loadBoard(createClient(), userId);
  const items = data.items.filter((i) => !i.hidden).map((i) => ({ id: i.id, name: i.name, unit: i.unit, bestPrice: i.bestPrice, bestSupplierId: i.bestSupplierId, measure: i.measure ?? null }));
  const suppliers = data.suppliers.map((s) => ({ id: s.id, name: s.name }));
  return <PriceImport items={items} suppliers={suppliers} supplierNames={Object.fromEntries(suppliers.map((s) => [s.id, s.name]))} />;
}

async function LinksTab() {
  const db = createClient();
  const [{ data: links }, { data: suppliers }, { data: itemRows }, { data: subs }] = await Promise.all([
    db.from('offer_links').select('*').order('created_at', { ascending: false }),
    db.from('supplier_usage').select('supplier_id, docs_90d, docs_total').order('docs_90d', { ascending: false }),
    db.from('items').select('id, name, category').is('merged_into', null).order('category').order('name').range(0, 4999),
    db.from('offer_submissions').select('link_id, created_at').order('created_at', { ascending: false }).limit(2000),
  ]);
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

  // Служебные ссылки, созданные при загрузке прайса из файла, поставщикам не отправляют
  const shownLinks = ((links ?? []) as OfferLink[]).filter((l) => l.note !== 'Создана при загрузке прайса из файла');
  return (
    <>
      <NewLinkToggle defaultOpen={!shownLinks.length}>
        <LinkForm suppliers={[...ranked, ...rest]} categories={[...catCounts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'))} items={itemRows ?? []} />
      </NewLinkToggle>

      <section className="card-box">
        <h2>Ссылки для поставщиков</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Поставщик открывает ссылку и сам вписывает свои цены. Входить в систему ему не нужно.</p>
        {!shownLinks.length ? <p className="muted" style={{ margin: 0 }}>Ссылок пока нет.</p> : shownLinks.map((l) => {
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
                <RevealSelect id={l.id} value={l.reveal} />
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
    </>
  );
}

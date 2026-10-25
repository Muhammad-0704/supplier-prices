'use client';
import { useEffect, useRef, useState } from 'react';
import { plural, relDays, rub, longDate } from '@/lib/format';
import { getBrowserClient } from '@/lib/supabase/client';
import type { BoardItem, HistoryPoint, Supplier } from '@/lib/types';
import { Badge, Button, Trend } from './ui';
import { PriceChart } from './PriceChart';

export function ItemPanel({ item, suppliers, manager, onClose, onChanged }: {
  item: BoardItem | null;
  suppliers: Map<string, Supplier>;
  manager: boolean;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [history, setHistory] = useState<HistoryPoint[] | null>(null);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const itemId = item?.id;

  useEffect(() => {
    if (!itemId) return;
    setHistory(null);
    closeRef.current?.focus();
    let alive = true;
    fetch(`/api/items/${itemId}`)
      .then((r) => (r.ok ? r.json() : { history: [] }))
      .then((b) => { if (alive) setHistory(b.history ?? []); })
      .catch(() => alive && setHistory([]));
    return () => { alive = false; };
  }, [itemId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name = (id: string) => suppliers.get(id)?.name ?? '—';

  async function toggleFavorite() {
    if (!item) return;
    setBusy(true);
    const db = getBrowserClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) { setBusy(false); return; }
    const { error } = item.favorite
      ? await db.from('user_favorites').delete().eq('user_id', user.id).eq('item_id', item.id)
      : await db.from('user_favorites').insert({ user_id: user.id, item_id: item.id });
    setBusy(false);
    onChanged(error ? `Не получилось: ${error.message}` : item.favorite ? 'Убрано из избранного' : 'Добавлено в избранное');
  }

  async function toggleHidden() {
    if (!item) return;
    setBusy(true);
    const db = getBrowserClient();
    const { data: { user } } = await db.auth.getUser();
    const { error } = await db.from('item_flags').upsert({ item_id: item.id, hidden: !item.hidden, updated_by: user?.id, updated_at: new Date().toISOString() });
    setBusy(false);
    onChanged(error ? `Не получилось: ${error.message}` : item.hidden ? 'Товар снова на доске' : 'Товар скрыт с доски для всей команды. Вернуть можно во вкладке «Скрытые»');
  }

  let verdict: React.ReactNode = null;
  if (item) {
    const cur = item.offers.find((o) => o.supplierId === item.currentSupplierId)!;
    const best = item.offers.find((o) => o.supplierId === item.bestSupplierId)!;
    verdict = item.currentSupplierId !== item.bestSupplierId && !cur.stale ? (
      <>Сейчас берём у <b>{name(cur.supplierId)}</b> по <b>{rub(cur.price)}</b>. Дешевле всего у <b>{name(best.supplierId)}</b>: <b>{rub(best.price)}</b>
        {manager && (item.overMonth ?? 0) > 0 ? <>. Разница {rub(item.overUnit!)} за {item.unit}, это <span className="bad">≈ {rub(item.overMonth!)} в месяц</span> при расходе около {Math.round(item.monthlyQty ?? 0)} {item.unit}.</> : '.'}
      </>
    ) : (
      <>Берём у <b>{name(cur.supplierId)}</b> по <b>{rub(cur.price)}</b>, <span className="good">это лучшая цена</span> среди {item.offers.length} {plural(item.offers.length, 'поставщика', 'поставщиков', 'поставщиков')}.</>
    );
  }

  return (
    <>
      <div className={`scrim${item ? ' on' : ''}`} onClick={onClose} />
      <aside className={`panel${item ? ' on' : ''}`} role="dialog" aria-modal="true" aria-hidden={!item} aria-label="Карточка товара">
        {item && (
          <>
            <div className="panel__head">
              <div>
                <h2>{item.name}</h2>
                <div className="muted" style={{ fontSize: 13 }}>{item.category} · цена за {item.unit}</div>
              </div>
              <button ref={closeRef} className="panel__close" type="button" aria-label="Закрыть" onClick={onClose}>×</button>
            </div>
            <div className="panel__body">
              <div className="acts">
                <Button onClick={toggleFavorite} disabled={busy} aria-pressed={item.favorite}>{item.favorite ? '★ В избранном' : '☆ В избранное'}</Button>
                {manager && <Button variant="quiet" onClick={toggleHidden} disabled={busy}>{item.hidden ? 'Вернуть на доску' : 'Скрыть с доски'}</Button>}
                <span className="muted">{item.rare ? `Не заказывали ${item.agoAny} дн.` : `Последняя закупка ${relDays(item.agoAny)}`}</span>
              </div>

              <div className="verdict">{verdict}</div>

              <div>
                <h3>Предложения</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="ot">
                    <thead><tr><th>Поставщик</th><th className="r">Цена</th><th className="r">С прошлой</th><th className="r">Закупка</th></tr></thead>
                    <tbody>
                      {item.offers.map((o, i) => (
                        <tr key={o.supplierId}>
                          <td>
                            <i className="sw-line" style={{ background: `var(--series-${Math.min(i + 1, 5)})` }} />
                            {name(o.supplierId)}
                            {o.supplierId === item.bestSupplierId && <Badge tone="best" />}
                            {o.supplierId === item.currentSupplierId && <Badge tone="current" />}
                            {o.stale && <Badge tone="stale" />}
                          </td>
                          <td className="r pr">{rub(o.price)}</td>
                          <td className="r"><Trend value={o.change} zeroLabel="без изм." /></td>
                          <td className="r sm" title={longDate(o.lastDate)}>{relDays(o.ago)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {item.proposals?.length ? (
                <div>
                  <h3>Предложения поставщиков</h3>
                  <table className="ot">
                    <thead><tr><th>Фирма</th><th className="r">Цена</th><th className="r">Когда</th></tr></thead>
                    <tbody>
                      {item.proposals.map((p, i) => {
                        const best = item.offers.find((o) => o.supplierId === item.bestSupplierId)?.price ?? 0;
                        return (
                          <tr key={i}>
                            <td>{p.company}{p.status === 'accepted' ? <Badge tone="best">принято</Badge> : <Badge tone="role">новое</Badge>}{p.minQty && <div className="muted" style={{ fontSize: 12 }}>мин. партия {p.minQty}</div>}</td>
                            <td className={`r pr ${p.price < best ? 'diff-lower' : ''}`}>{rub(p.price)}</td>
                            <td className="r sm">{longDate(p.date)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {manager && <a href="/offers" className="muted" style={{ fontSize: 13 }}>Все предложения →</a>}
                </div>
              ) : null}

              <div className="chart">
                <h3>История цен</h3>
                {history === null ? <p className="muted">Загружаем историю…</p> : history.length ? (
                  <PriceChart history={history} order={item.offers.map((o) => o.supplierId)} names={name} />
                ) : <p className="muted">Истории пока нет.</p>}
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

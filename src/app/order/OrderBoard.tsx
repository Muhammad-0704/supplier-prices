'use client';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, RowMenu, SearchField, Segmented } from '@/components/ui';
import { longDate, plural, rub } from '@/lib/format';
import type { OrderRow } from '@/lib/reorder-data';
import { countLine, fmtQty, rhythmLine } from '@/lib/reorder-text';
import { getBrowserClient } from '@/lib/supabase/client';
import { clearMark, saveCounts, setMark, type ActionResult } from './actions';

type View = 'now' | 'ordered' | 'all';
type Group = 'best' | 'current';

const STATUS = {
  due: { tone: 'rise', text: 'пора' },
  soon: { tone: 'role', text: 'скоро' },
  check: { tone: 'neutral', text: 'проверить' },
  ok: { tone: 'neutral', text: 'хватает' },
} as const;

export function OrderBoard({ rows, suppliers, skipped = [], manager = false }: { rows: OrderRow[]; suppliers: Record<string, string>; skipped?: string[]; manager?: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<View>('now');
  const [group, setGroup] = useState<Group>('best');
  const [q, setQ] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');
  const [pending, start] = useTransition();

  const showToast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 3200); }, []);
  const run = (p: Promise<ActionResult>, after?: () => void) => start(async () => {
    const r = await p;
    if (r.error) showToast(r.error);
    else { if (r.ok) showToast(r.ok); after?.(); router.refresh(); }
  });

  // Коллега пересчитал склад или отметил заказ — обновить список
  useEffect(() => {
    const db = getBrowserClient();
    let t: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(t); t = setTimeout(() => router.refresh(), 1200); };
    const ch = db.channel('order')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_counts' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reorder_marks' }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'purchases' }, refresh)
      .subscribe();
    return () => { clearTimeout(t); db.removeChannel(ch); };
  }, [router]);

  const n = useMemo(() => ({
    now: rows.filter((r) => r.s.status !== 'ok' && !r.s.ordered).length,
    ordered: rows.filter((r) => r.s.ordered).length,
    all: rows.length,
  }), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const order = { due: 0, soon: 1, check: 2, ok: 3 };
    return rows
      .filter((r) => (view === 'now' ? r.s.status !== 'ok' && !r.s.ordered : view === 'ordered' ? r.s.ordered : true))
      .filter((r) => !needle || r.name.toLowerCase().includes(needle))
      .sort((a, b) => order[a.s.status] - order[b.s.status] || a.name.localeCompare(b.name, 'ru'));
  }, [rows, view, q]);

  const groups = useMemo(() => {
    const m = new Map<string, OrderRow[]>();
    for (const r of shown) {
      const k = group === 'best' ? r.bestSupplierId : r.currentSupplierId;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || (suppliers[a[0]] ?? '').localeCompare(suppliers[b[0]] ?? '', 'ru'));
  }, [shown, group, suppliers]);

  const filled = Object.entries(counts).filter(([, v]) => v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.'))));

  function copyText(supId: string, list: OrderRow[]) {
    const lines = list.filter((r) => r.s.orderQty > 0).map((r) => `${r.name} — ${fmtQty(r.s.orderQty)} ${r.unit}`);
    return `Заказ ${suppliers[supId] ?? ''} на ${longDate(new Date(Date.now() + 86_400_000).toISOString())}:\n${lines.join('\n')}`;
  }

  return (
    <>
      <section className="order-head">
        <h2 className="order-title">Что заказать</h2>
        <p className="muted order-sub">
          По ритму ваших закупок за полгода, остатки 1С не используются. «Проверить» — товар не брали заметно дольше обычного. Впишите факт со склада, и расчёт пойдёт по нему.
        </p>
        {skipped.length > 0 && (
          <p className="muted order-sub">
            Не участвуют в заявке: {skipped.join(', ')}.{manager && <> <a href="/settings?tab=request" className="link link--muted">Изменить</a></>}
          </p>
        )}
      </section>

      <div className="bar">
        <SearchField value={q} onValueChange={setQ} />
        <Segmented<View> label="Какие товары" value={view} onChange={setView}
          options={[{ value: 'now', label: 'К заказу', count: n.now }, { value: 'ordered', label: 'Заказано', count: n.ordered }, { value: 'all', label: 'Все', count: n.all }]} />
        <Segmented<Group> label="Группировать" value={group} onChange={setGroup}
          options={[{ value: 'best', label: 'Где дешевле' }, { value: 'current', label: 'У кого брали' }]} />
      </div>

      {!groups.length && (
        <div className="cards__note">
          {view === 'now' ? 'Сейчас заказывать нечего: по ритму закупок всего хватает.' : view === 'ordered' ? 'Нет товаров с отметкой «заказано».' : 'Нет товаров с регулярными закупками.'}
        </div>
      )}

      {groups.map(([supId, list]) => {
        const toOrder = list.filter((r) => r.s.orderQty > 0 && r.s.status !== 'ok');
        const total = toOrder.reduce((s, r) => s + r.s.orderQty * (group === 'best' ? r.bestPrice : r.currentPrice), 0);
        return (
          <section key={supId} className="sub-card">
            <div className="sub-card__head">
              <span>
                <b>{suppliers[supId] ?? 'Поставщик'}</b>{' '}
                <span className="muted">· {list.length} {plural(list.length, 'позиция', 'позиции', 'позиций')}{total > 0 ? ` · ≈ ${rub(total)}` : ''}</span>
              </span>
              {view !== 'ordered' && toOrder.length > 0 && (
                <span className="acts">
                  <CopyOrder text={copyText(supId, toOrder)} />
                  <button className="pb-btn pb-btn--quiet pb-btn--sm" type="button" disabled={pending}
                    onClick={() => run(setMark(toOrder.map((r) => r.itemId), 'ordered'))}>Всё заказано</button>
                </span>
              )}
            </div>
            <div>
              {list.map((r) => {
                const st = STATUS[r.s.status];
                const price = group === 'best' ? r.bestPrice : r.currentPrice;
                const other = r.currentSupplierId !== r.bestSupplierId;
                const cl = countLine(r.s, r.unit);
                return (
                  <div key={r.itemId} className="ord-row">
                    <div className="ord-row__name">
                      <span>
                        {r.s.ordered ? <Badge tone="best">заказано</Badge> : <Badge tone={st.tone}>{st.text}</Badge>} <b>{r.name}</b>
                      </span>
                      <span className="muted">{cl ?? rhythmLine(r.s, r.unit)}</span>
                      {other && (
                        <span className="muted">
                          {group === 'best'
                            ? <>Последний раз брали у {suppliers[r.currentSupplierId] ?? '—'} по {rub(r.currentPrice)}</>
                            : <>Дешевле у {suppliers[r.bestSupplierId] ?? '—'}: {rub(r.bestPrice)}</>}
                        </span>
                      )}
                    </div>
                    <div className="ord-row__qty">
                      <span className="ord-row__label">Заказать</span>
                      <span className="num ord-row__big">{r.s.orderQty > 0 && r.s.status !== 'ok' ? `${fmtQty(r.s.orderQty)} ${r.unit}` : '—'}</span>
                      <span className="muted num">{rub(price)} за {r.unit}</span>
                    </div>
                    <label className="ord-row__count">
                      <span className="ord-row__label">На складе</span>
                      <input className="input num" inputMode="decimal" placeholder={r.s.estLeft != null ? `~${fmtQty(r.s.estLeft)}` : 'факт'}
                        value={counts[r.itemId] ?? ''} aria-label={`Сколько ${r.name} на складе, ${r.unit}`}
                        onChange={(e) => setCounts((c) => ({ ...c, [r.itemId]: e.target.value.replace(/[^\d.,]/g, '') }))} />
                    </label>
                    <div className="ord-row__acts">
                      {r.s.ordered ? (
                        <button className="pb-btn pb-btn--quiet pb-btn--sm" type="button" disabled={pending} onClick={() => run(clearMark(r.itemId))}>Снять отметку</button>
                      ) : (
                        <>
                          <button className="pb-btn pb-btn--sm" type="button" disabled={pending} onClick={() => run(setMark([r.itemId], 'ordered'))}>Заказано</button>
                          <RowMenu label={`Ещё действия: ${r.name}`} items={[
                            { text: 'Не напоминать 3 дня', onSelect: () => run(setMark([r.itemId], 'snoozed', 3)), disabled: pending },
                            { text: 'Не напоминать неделю', onSelect: () => run(setMark([r.itemId], 'snoozed', 7)), disabled: pending },
                            { text: 'Не напоминать месяц', onSelect: () => run(setMark([r.itemId], 'snoozed', 30)), disabled: pending },
                          ]} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {filled.length > 0 && (
        <div className="order-save">
          <button className="pb-btn pb-btn--primary" type="button" disabled={pending}
            onClick={() => run(saveCounts(filled.map(([itemId, v]) => ({ itemId, qty: Number(v.replace(',', '.')) }))), () => setCounts({}))}>
            Сохранить пересчёт · {filled.length} {plural(filled.length, 'позиция', 'позиции', 'позиций')}
          </button>
          <button className="pb-btn pb-btn--quiet" type="button" onClick={() => setCounts({})}>Очистить</button>
        </div>
      )}

      <div className={`toast${toast ? ' on' : ''}`} role="status">{toast}</div>
    </>
  );
}

function CopyOrder({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="pb-btn pb-btn--sm" onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch { window.prompt('Скопируйте заказ', text); }
      setDone(true); setTimeout(() => setDone(false), 2000);
    }}>
      {done ? 'Скопировано' : 'Скопировать заказ'}
    </button>
  );
}

'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shortSupplier, softHyphens, rub, rubFine, pct, plural, shortDate, longDate, syncLabel } from '@/lib/format';
import { getBrowserClient } from '@/lib/supabase/client';
import type { BoardData, BoardItem, Supplier } from '@/lib/types';
import { Button, ItemCard, PriceCell, RefreshIcon, SearchField, Segmented, StatStrip, SyncStatus } from './ui';
import { ItemPanel } from './ItemPanel';
import { ChoiceMenu, Picker, SortIcon } from './Picker';

type Asm = 'active' | 'all' | 'fav' | 'hidden';
type Sort = 'cat' | 'save' | 'spread' | 'recent' | 'az';
type View = 'mx' | 'list';

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } },
};

function asmOk(it: BoardItem, asm: Asm) {
  if (asm === 'hidden') return it.hidden;
  if (asm === 'fav') return it.favorite;
  if (it.hidden) return false;
  return asm === 'all' || !it.rare || it.favorite;
}

export function Board({ data }: { data: BoardData }) {
  const router = useRouter();
  const manager = data.role === 'manager';
  const sup = useMemo(() => new Map(data.suppliers.map((s) => [s.id, s])), [data.suppliers]);
  const categories = useMemo(() => {
    const m = new Map<string, number>();
    data.items.forEach((i) => m.set(i.category, (m.get(i.category) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  }, [data.items]);

  // Поставщики по популярности, с числом товаров на доске
  const supplierOptions = useMemo(() => {
    const n = new Map<string, number>();
    data.items.forEach((i) => i.offers.forEach((o) => n.set(o.supplierId, (n.get(o.supplierId) ?? 0) + 1)));
    return data.suppliers.map((s) => ({ value: s.id, label: s.name, count: n.get(s.id) ?? 0 }));
  }, [data.items, data.suppliers]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [supF, setSupF] = useState('all');
  const [sort, setSort] = useState<Sort>('cat');
  const [asm, setAsm] = useState<Asm>('active');
  const [overOnly, setOverOnly] = useState(false);
  const [view, setView] = useState<View>('mx');
  const [compact, setCompact] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(data.sync.status === 'running');
  const [toast, setToast] = useState('');
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const prevPrices = useRef<Map<string, number> | null>(null);

  // Вид и компактность запоминаются на устройстве
  useEffect(() => {
    const v = store.get('pb_view') as View | null;
    setView(v ?? (window.innerWidth < 720 ? 'list' : 'mx'));
    setCompact(store.get('pb_compact') === '1');
  }, []);

  // Подсветка цен, изменившихся с прошлой загрузки
  useEffect(() => {
    const now = new Map<string, number>();
    data.items.forEach((i) => i.offers.forEach((o) => now.set(`${i.id}:${o.supplierId}`, o.price)));
    if (prevPrices.current) {
      const changed = new Set<string>();
      now.forEach((p, k) => { if (prevPrices.current!.get(k) !== p) changed.add(k); });
      if (changed.size) { setFlash(changed); setTimeout(() => setFlash(new Set()), 2600); }
    }
    prevPrices.current = now;
  }, [data.items]);

  const showToast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 3200); }, []);

  // Живые обновления: новая закупка или завершённая синхронизация → перезагрузить данные
  useEffect(() => {
    const db = getBrowserClient();
    let t: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(t); t = setTimeout(() => router.refresh(), 1200); };
    const ch = db
      .channel('board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offer_lines' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'price_overrides' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sync_runs' }, (p: { new?: { status?: string } }) => {
        if (p.new?.status === 'running') setSyncing(true);
        else { setSyncing(false); refresh(); }
      })
      .subscribe();
    return () => { clearTimeout(t); db.removeChannel(ch); };
  }, [router]);

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) showToast(body.message || 'Не удалось получить данные из 1С');
      else showToast(`Получено из 1С: ${body.docs} ${plural(body.docs, 'накладная', 'накладные', 'накладных')}`);
      router.refresh();
    } catch {
      showToast('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setSyncing(false);
    }
  }

  const base = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.items.filter((it) =>
      (cat === 'all' || it.category === cat) &&
      (supF === 'all' || it.offers.some((o) => o.supplierId === supF)) &&
      (!overOnly || (it.overMonth ?? 0) > 0) &&
      (!s || it.name.toLowerCase().includes(s) || it.category.toLowerCase().includes(s)));
  }, [data.items, q, cat, supF, overOnly]);

  const list = useMemo(() => {
    const r = base.filter((it) => asmOk(it, asm));
    const cur = (it: BoardItem) => it.offers.find((o) => o.supplierId === it.currentSupplierId)!;
    const by: Record<Sort, ((a: BoardItem, b: BoardItem) => number) | null> = {
      cat: null,
      save: (a, b) => (b.overMonth ?? 0) - (a.overMonth ?? 0),
      spread: (a, b) => b.spread - a.spread,
      recent: (a, b) => Date.parse(cur(b).lastDate) - Date.parse(cur(a).lastDate),
      az: (a, b) => a.name.localeCompare(b.name, 'ru'),
    };
    return by[sort] ? [...r].sort(by[sort]!) : r;
  }, [base, asm, sort]);

  const rareHidden = asm === 'active' ? base.filter((it) => asmOk(it, 'all') && !asmOk(it, 'active')).length : 0;
  const counts = {
    active: data.items.filter((i) => asmOk(i, 'active')).length,
    all: data.items.filter((i) => asmOk(i, 'all')).length,
    fav: data.items.filter((i) => i.favorite).length,
    hidden: data.items.filter((i) => i.hidden).length,
  };

  const stats = useMemo(() => {
    let up = 0, dn = 0;
    data.items.forEach((i) => i.offers.forEach((o) => { if (o.ago <= 7 && o.change) (o.change > 0 ? up++ : dn++); }));
    const over = data.items.filter((i) => (i.overMonth ?? 0) > 0);
    const sum = over.reduce((s, i) => s + (i.overMonth ?? 0), 0);
    const items: { label: string; value: string; sub?: React.ReactNode; tone?: 'good' | 'bad' }[] = [
      { label: 'Товаров', value: String(data.items.length), sub: `в ${categories.length} ${plural(categories.length, 'категории', 'категориях', 'категориях')}` },
      { label: 'Поставщиков', value: String(data.suppliers.length), sub: 'с ценами на доске' },
      { label: 'Цены за 7 дней', value: String(up + dn), sub: <><span className="pb-trend--rise">▲ {up} подорожали</span> · <span className="pb-trend--drop">▼ {dn} подешевели</span></> },
    ];
    if (manager) items.push({ label: 'Переплата в месяц', value: rub(Math.round(sum / 100) * 100), sub: `по ${over.length} ${plural(over.length, 'товару', 'товарам', 'товарам')}, если брать по лучшей цене`, tone: 'bad' });
    return items;
  }, [data.items, data.suppliers.length, categories.length, manager]);

  const open = openId ? data.items.find((i) => i.id === openId) ?? null : null;
  const asmOptions = [
    { value: 'active' as Asm, label: 'Ходовые', count: counts.active },
    { value: 'all' as Asm, label: 'Все', count: counts.all },
    { value: 'fav' as Asm, label: '★ Избранное', count: counts.fav },
    ...(counts.hidden ? [{ value: 'hidden' as Asm, label: 'Скрытые', count: counts.hidden }] : []),
  ];
  const emptyText = asm === 'fav' ? 'В избранном пока пусто. Откройте товар и нажмите «В избранное».' : asm === 'hidden' ? 'Скрытых товаров нет.' : 'Ничего не нашлось. Попробуйте другое слово или снимите фильтры.';
  const syncState = syncing ? 'syncing' : data.sync.status === 'error' ? 'error' : 'ok';
  const syncText = syncing ? 'Получаем данные из 1С…' : data.sync.status === 'error' ? `Ошибка синхронизации. ${syncLabel(data.sync.lastOkAt)}` : syncLabel(data.sync.lastOkAt);

  return (
    <>
      <div className="top__right" style={{ justifyContent: 'flex-end' }}>
        <SyncStatus state={syncState} label={syncText} />
        <Button variant="primary" icon={<RefreshIcon />} busy={syncing} disabled={syncing} onClick={syncNow}>Обновить из 1С</Button>
      </div>

      {data.mock && <div className="notice">Демо-режим: данные придуманы. Чтобы подключить настоящую 1С:Фреш, задайте ONEC_MODE=odata и доступ к OData (см. README).</div>}
      {data.sync.status === 'error' && data.sync.message && <div className="notice notice--error">{data.sync.message}</div>}
      {data.sync.status === 'never' && !data.items.length && (
        <div className="notice">Данных ещё нет. Нажмите «Обновить из 1С», чтобы забрать приходные накладные.</div>
      )}

      <StatStrip items={stats} />

      <div className="bar">
        <SearchField value={q} onValueChange={setQ} placeholder="Найти товар: сливки, стакан 350…" />
        <Picker label="Категория" allLabel="Все категории" searchPlaceholder="Найти категорию" value={cat} onChange={setCat}
          options={categories.map(([c, n]) => ({ value: c, label: c, count: n }))} />
        <Picker label="Поставщик" allLabel="Все поставщики" searchPlaceholder="Найти поставщика" value={supF} onChange={setSupF}
          options={supplierOptions} />
        <ChoiceMenu<Sort> label="Сортировка" value={sort} onChange={setSort} icon={<SortIcon />} options={[
          { value: 'cat', label: 'По категориям' },
          ...(manager ? [{ value: 'save' as Sort, label: 'Сначала переплаты' }] : []),
          { value: 'spread', label: 'Сначала большой разброс' },
          { value: 'recent', label: 'Недавно закупали' },
          { value: 'az', label: 'По алфавиту' },
        ]} />
        <Segmented<View> label="Вид" value={view} onChange={(v) => { setView(v); store.set('pb_view', v); }} options={[{ value: 'mx', label: 'Матрица' }, { value: 'list', label: 'Карточки' }]} />
      </div>
      <div className="bar">
        <Segmented<Asm> label="Ассортимент" value={asm} onChange={setAsm} options={asmOptions} />
        {manager && (
          <label className="tog"><input type="checkbox" checked={overOnly} onChange={(e) => setOverOnly(e.target.checked)} /> Только где переплачиваем</label>
        )}
        {view === 'mx' && (
          <label className="tog"><input type="checkbox" checked={compact} onChange={(e) => { setCompact(e.target.checked); store.set('pb_compact', e.target.checked ? '1' : '0'); }} /> Компактно</label>
        )}
      </div>

      {view === 'mx' ? (
        <Matrix list={list} suppliers={data.suppliers} sort={sort} supF={supF} compact={compact} flash={flash} manager={manager} rareHidden={rareHidden} rareDays={data.rareDays} emptyText={emptyText} onOpen={setOpenId} onShowAll={() => setAsm('all')} />
      ) : (
        <div className="cards">
          {list.length ? list.map((it) => {
            const b = it.offers.find((o) => o.supplierId === it.bestSupplierId)!;
            const c = it.offers.find((o) => o.supplierId === it.currentSupplierId)!;
            return (
              <ItemCard key={it.id} name={it.name} favorite={it.favorite}
                meta={`${it.category} · за ${it.unit}${it.rare ? ` · ${it.agoAny} дн. не заказывали` : ''}${it.cheaperAlt ? ` · другая фасовка дешевле за ${it.cheaperAlt.base} на ${pct(it.cheaperAlt.diff)}` : ''}`}
                best={{ price: b.price, supplier: sup.get(b.supplierId)?.name ?? '—' }}
                current={{ price: c.price, supplier: sup.get(c.supplierId)?.name ?? '—' }}
                overpay={manager ? it.overMonth ?? 0 : undefined}
                suppliers={it.offers.length}
                onClick={() => setOpenId(it.id)} />
            );
          }) : <div className="cards__note">{emptyText}</div>}
          {rareHidden > 0 && <RareNote n={rareHidden} days={data.rareDays} onShowAll={() => setAsm('all')} />}
        </div>
      )}

      {view === 'mx' && (
        <div className="legend">
          <span><i className="sw sw--best" />лучшая цена по товару</span>
          <span><i className="sw sw--cur" />у кого берём сейчас (последняя закупка)</span>
          <span><i className="sw sw--stale" />цена устарела, в сравнении не участвует</span>
          <span>✎ цену обновили вручную</span>
          <span><b className="pb-trend--rise">▲</b>/<b className="pb-trend--drop">▼</b> изменение с прошлой закупки у этого поставщика</span>
        </div>
      )}

      <ItemPanel item={open} items={data.items} suppliers={sup} manager={manager} onOpenItem={setOpenId} onClose={() => setOpenId(null)} onChanged={(m) => { showToast(m); router.refresh(); }} />
      <div className={`toast${toast ? ' on' : ''}`} role="status">{toast}</div>
    </>
  );
}

/** Предложение поставщика дешевле нашей лучшей цены, если есть */
function cheaperProposal(it: BoardItem) {
  const p = it.proposals?.[0];
  const best = it.offers.find((o) => o.supplierId === it.bestSupplierId)?.price;
  return p && best && p.price < best ? p : null;
}

function RareNote({ n, days, onShowAll, asCell, cols }: { n: number; days: number; onShowAll: () => void; asCell?: boolean; cols?: number }) {
  const text = <>Скрыто {n} {plural(n, 'редкий товар', 'редких товара', 'редких товаров')}: их не заказывали больше {days} дней. <button type="button" className="link" onClick={onShowAll}>Показать все</button></>;
  if (asCell) return <tr className="more"><td colSpan={cols}><span className="g">{text}</span></td></tr>;
  return <div className="cards__note">{text}</div>;
}

function Matrix(props: {
  list: BoardItem[]; suppliers: Supplier[]; sort: Sort; supF: string; compact: boolean; flash: Set<string>; manager: boolean;
  rareHidden: number; rareDays: number; emptyText: string; onOpen: (id: string) => void; onShowAll: () => void;
}) {
  const { list, sort, supF, compact, flash, manager, onOpen } = props;
  // Показываем только поставщиков, у которых есть товары в текущей выборке
  const sups = list.length ? props.suppliers.filter((s) => list.some((it) => it.offers.some((o) => o.supplierId === s.id))) : props.suppliers;
  const names = new Map(props.suppliers.map((s) => [s.id, s.name]));
  const cols = sups.length + 1;

  const row = (it: BoardItem) => {
    const curName = names.get(it.currentSupplierId) ?? '—';
    const over = manager && (it.overUnit ?? 0) > 0;
    return (
      <tr key={it.id}>
        <th className="item" scope="row" title={it.name} onClick={() => onOpen(it.id)}>
          <span className="nm">{it.favorite && <span className="star" aria-label="избранное">★</span>}{it.name}</span>
          <span className="mt">
            {it.unit} · берём у {curName}
            {over ? <> · <b>+{rub(it.overUnit!)}</b></> : it.rare ? ` · ${it.agoAny} дн. не заказывали` : ''}
            {cheaperProposal(it) && <> · <span className="prop" title={`Предложение от ${cheaperProposal(it)!.company}`}>предл. {rub(cheaperProposal(it)!.price)}</span></>}
            {it.cheaperAlt && <> · <span className="alt" title={`${it.cheaperAlt.name}: ${rubFine(it.cheaperAlt.perBase)} за ${it.cheaperAlt.base} у ${names.get(it.cheaperAlt.supplierId) ?? '—'}`}>другая фасовка −{pct(it.cheaperAlt.diff)} за {it.cheaperAlt.base}</span></>}
          </span>
        </th>
        {sups.map((s) => {
          const o = it.offers.find((x) => x.supplierId === s.id);
          const key = `${it.id}:${s.id}`;
          return (
            <td key={s.id} className={flash.has(key) ? 'flash' : undefined}>
              {o ? (
                <PriceCell price={o.price} trend={o.change} date={o.manual?.kind === 'price' ? `✎ ${shortDate(o.lastDate)}` : shortDate(o.lastDate)} best={o.supplierId === it.bestSupplierId} current={o.supplierId === it.currentSupplierId}
                  stale={o.stale} highlight={s.id === supF} compact={compact} onOpen={() => onOpen(it.id)}
                  title={o.manual?.kind === 'price' ? `${s.name}: ${rub(o.price)} за ${it.unit}, обновлено вручную ${longDate(o.lastDate)} (в 1С ${rub(o.manual.sourcePrice)})` : o.manual?.kind === 'stale' ? `${s.name}: ${rub(o.price)}, отмечена устаревшей` : `${s.name}: ${rub(o.price)} за ${it.unit}, закупка ${longDate(o.lastDate)}`} />
              ) : (
                <PriceCell price={null} highlight={s.id === supF} compact={compact} />
              )}
            </td>
          );
        })}
      </tr>
    );
  };

  let body: React.ReactNode;
  if (!list.length) body = <tr className="empty-row"><td colSpan={cols}>{props.emptyText}</td></tr>;
  else if (sort === 'cat') {
    const groups = new Map<string, BoardItem[]>();
    list.forEach((it) => groups.set(it.category, [...(groups.get(it.category) ?? []), it]));
    body = [...groups.entries()].map(([c, g]) => [
      <tr className="grp" key={`g-${c}`}><th colSpan={cols}><span className="g">{c}<span className="n">{g.length}</span></span></th></tr>,
      ...g.map(row),
    ]);
  } else body = list.map(row);

  return (
    <MatrixScroller compact={compact}>
      <table className="mx">
        <thead>
          <tr>
            <th className="corner">Товар / цена за ед.{sups.length < props.suppliers.length && <span className="cnt">{sups.length} из {props.suppliers.length} поставщиков</span>}</th>
            {sups.map((s) => (
              <th key={s.id} scope="col" className={s.id === supF ? 'hl' : undefined} title={`${s.name}: ${s.docs90d ?? 0} накладных за 90 дней`}>
                <span className="sup-name">{softHyphens(shortSupplier(s.name))}</span>
                <span className="cnt">{list.filter((it) => it.offers.some((o) => o.supplierId === s.id)).length} поз.</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body}
          {props.rareHidden > 0 && <RareNote asCell cols={cols} n={props.rareHidden} days={props.rareDays} onShowAll={props.onShowAll} />}
        </tbody>
      </table>
    </MatrixScroller>
  );
}

/**
 * Матрицу можно тянуть мышкой влево-вправо, как карту. Клик без сдвига по-прежнему открывает товар.
 * Нижняя полоса прокрутки и Shift + колесо тоже работают.
 */
function MatrixScroller({ compact, children }: { compact: boolean; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const b = box.current;
    // Только мышь и левая кнопка; на телефоне таблица и так листается пальцем
    if (!b || e.pointerType !== 'mouse' || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('input, select, textarea, a, button')) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = b.scrollLeft;
    const startTop = b.scrollTop;
    let moved = false;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (!moved) { moved = true; setDragging(true); }
      b.scrollLeft = startLeft - dx;
      b.scrollTop = startTop - dy;
      ev.preventDefault();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) {
        setDragging(false);
        // Отпускание после перетаскивания не считается кликом по цене
        const stop = (ce: MouseEvent) => { ce.stopPropagation(); ce.preventDefault(); };
        window.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div className={`board board--pan${compact ? ' compact' : ''}${dragging ? ' board--dragging' : ''}`} ref={box} onPointerDown={onPointerDown}>
      {children}
    </div>
  );
}

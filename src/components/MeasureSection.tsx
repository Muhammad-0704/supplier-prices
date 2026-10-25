'use client';
import { useMemo, useState } from 'react';
import { makeIndex } from '@/lib/compare';
import { pct, rub, rubFine } from '@/lib/format';
import { measureText, type Base } from '@/lib/measure';
import { getBrowserClient } from '@/lib/supabase/client';
import type { BoardItem, Supplier } from '@/lib/types';
import { Badge } from './ui';

const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
const perBaseRub = rubFine;

/**
 * Цена за кг / л / шт и похожие товары в другой фасовке.
 * Руководитель может поправить фасовку, если её неверно поняли из названия.
 */
export function MeasureSection({ item, items, suppliers, manager, onOpenItem, onChanged }: {
  item: BoardItem;
  items: BoardItem[];
  suppliers: Map<string, Supplier>;
  manager: boolean;
  onOpenItem: (id: string) => void;
  onChanged: (message: string) => void;
}) {
  // Индекс считаем один раз на весь список; редкие и скрытые товары в сравнении не участвуют
  const index = useMemo(() => makeIndex(items.filter((i) => !i.rare && !i.hidden)), [items]);
  const alts = useMemo(() => index.alternatives(item), [index, item]);
  const [editing, setEditing] = useState(false);
  const [per, setPer] = useState('');
  const [base, setBase] = useState<Base>('кг');
  const [busy, setBusy] = useState(false);
  const m = item.measure;

  async function save(body: { base: Base | null; per_unit: number | null; disabled: boolean } | null) {
    setBusy(true);
    const db = getBrowserClient();
    const { error } = body
      ? await db.from('item_measures').upsert({ item_id: item.id, ...body, updated_at: new Date().toISOString() })
      : await db.from('item_measures').delete().eq('item_id', item.id);
    setBusy(false);
    setEditing(false);
    onChanged(error ? `Не получилось: ${error.message}` : body?.disabled ? 'Товар не сравнивается за кг' : 'Фасовка сохранена');
  }

  function startEdit() {
    setPer(m ? String(m.perUnit).replace('.', ',') : '');
    setBase(m?.base ?? 'кг');
    setEditing(true);
  }

  const own = m ? item.bestPrice / m.perUnit : null;
  if (!m && !manager) return null;

  return (
    <div>
      <h3>{m ? `Цена за ${m.base}` : 'Цена за кг'}</h3>
      {editing ? (
        <form className="measure-row" onSubmit={(e) => {
          e.preventDefault();
          const v = Number(per.replace(',', '.'));
          if (!(v > 0)) { onChanged('Укажите, сколько в одной единице: число больше нуля'); return; }
          save({ base, per_unit: v, disabled: false });
        }}>
          <span>1 {item.unit} =</span>
          <input className="input num" inputMode="decimal" value={per} onChange={(e) => setPer(e.target.value)} aria-label="Сколько в одной единице" autoFocus />
          <select className="select" value={base} onChange={(e) => setBase(e.target.value as Base)} aria-label="Чего">
            <option value="кг">кг</option><option value="л">л</option><option value="шт">шт</option>
          </select>
          <button className="pb-btn pb-btn--sm pb-btn--primary" type="submit" disabled={busy}>Сохранить</button>
          <button className="pb-btn pb-btn--sm pb-btn--quiet" type="button" disabled={busy} onClick={() => save({ base: null, per_unit: null, disabled: true })}>Не сравнивать</button>
          <button className="pb-btn pb-btn--sm pb-btn--quiet" type="button" disabled={busy} onClick={() => save(null)}>Как в названии</button>
          <button className="pb-btn pb-btn--sm pb-btn--quiet" type="button" onClick={() => setEditing(false)}>Отмена</button>
        </form>
      ) : (
        <div className="measure-row">
          {m ? (
            <span>{measureText(m, item.unit)}{m.source === 'manual' && <> <Badge>вручную</Badge></>}{m.source === 'auto' && <span className="muted"> · из названия</span>}</span>
          ) : (
            <span className="muted">Фасовку не удалось понять из названия.</span>
          )}
          {manager && <button className="link" type="button" onClick={startEdit}>{m ? 'Поправить' : 'Указать'}</button>}
        </div>
      )}

      {m && own != null && (
        <div style={{ marginTop: 8 }}>
          <div className="sim-row sim-row--self">
            <span className="sim-row__name"><b>Этот товар</b></span>
            <span className="sim-row__meta">{suppliers.get(item.bestSupplierId)?.name ?? '—'} · {rub(item.bestPrice)} за {item.unit}</span>
            <span className="sim-row__price">{perBaseRub(own)}<small className="muted">за {m.base}</small></span>
          </div>
          {alts.map((a) => (
            <button key={a.item.id} type="button" className="sim-row" onClick={() => onOpenItem(a.item.id)}>
              <span className="sim-row__name">{a.item.name}</span>
              <span className="sim-row__meta">
                {suppliers.get(a.item.bestSupplierId)?.name ?? '—'} · {rub(a.item.bestPrice)} за {a.item.unit} · {fmt.format(a.item.measure!.perUnit)} {m.base}
              </span>
              <span className={`sim-row__price ${a.diff < -0.005 ? 'diff-lower' : a.diff > 0.005 ? 'diff-higher' : ''}`}>
                {perBaseRub(a.perBase)}
                <small>{Math.abs(a.diff) < 0.005 ? 'так же' : `${a.diff < 0 ? '−' : '+'}${pct(a.diff)}`}</small>
              </span>
            </button>
          ))}
          {!alts.length && <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Похожих товаров в другой фасовке нет.</p>}
          {alts.length > 0 && <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>Похожие подобраны по названию. Проверьте, что это действительно тот же товар.</p>}
        </div>
      )}
    </div>
  );
}

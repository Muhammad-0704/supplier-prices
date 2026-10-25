'use client';
import { useMemo, useState } from 'react';
import { num } from '@/lib/format';

interface Item { id: string; name: string; unit: string; category: string }
type Compare = 'lower' | 'same' | 'higher' | 'unknown';
interface Custom { key: number; name: string; unit: string; price: string }

const COMPARE_TEXT: Record<Compare, string> = { lower: 'ниже нашей цены', same: 'на уровне нашей цены', higher: 'выше нашей цены', unknown: 'сравнить не с чем' };
const COMPARE_TONE: Record<Compare, string> = { lower: 'best', same: 'neutral', higher: 'rise', unknown: 'neutral' };

export function OfferForm({ token, items, lastMine }: { token: string; items: Item[]; lastMine: Record<string, number> }) {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [minQty, setMinQty] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Custom[]>([]);
  const [validUntil, setValidUntil] = useState('');
  const [contact, setContact] = useState('');
  const [comment, setComment] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ itemId?: string; name: string; price: number; compare: Compare }[] | null>(null);

  const filled = Object.values(prices).filter((v) => v.trim()).length + custom.filter((c) => c.name.trim() && c.price.trim()).length;
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const m = new Map<string, Item[]>();
    items.filter((i) => !s || i.name.toLowerCase().includes(s)).forEach((i) => m.set(i.category, [...(m.get(i.category) ?? []), i]));
    return [...m.entries()];
  }, [items, q]);

  async function submit() {
    setError('');
    const lines = [
      ...Object.entries(prices).filter(([, v]) => v.trim()).map(([itemId, price]) => ({ itemId, price, minQty: minQty[itemId], validUntil: validUntil || undefined })),
      ...custom.filter((c) => c.name.trim() && c.price.trim()).map((c) => ({ customName: c.name, unit: c.unit, price: c.price, validUntil: validUntil || undefined })),
    ];
    if (!lines.length) { setError('Укажите цену хотя бы для одного товара.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/o/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact, comment, lines }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || 'Не удалось отправить. Попробуйте ещё раз.'); return; }
      setResult(body.lines);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Нет связи. Проверьте интернет и отправьте ещё раз: введённые цены сохранились на экране.');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const counts = result.reduce((a, r) => ((a[r.compare] = (a[r.compare] ?? 0) + 1), a), {} as Record<string, number>);
    return (
      <section className="card-box">
        <h2>Спасибо, цены отправлены</h2>
        <p className="muted" style={{ margin: 0 }}>
          Принято позиций: {result.length}. Ниже нашей текущей цены: {counts.lower ?? 0}, на уровне: {counts.same ?? 0}, выше: {counts.higher ?? 0}.
          Мы свяжемся с вами, если предложение подойдёт.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="ot">
            <thead><tr><th>Товар</th><th className="r">Ваша цена</th><th className="r">Сравнение</th></tr></thead>
            <tbody>
              {result.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td className="r pr">{num(r.price)} ₽</td>
                  <td className="r"><span className={`pb-badge pb-badge--${COMPARE_TONE[r.compare]}`}>{COMPARE_TEXT[r.compare]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="acts">
          <button type="button" className="pb-btn" onClick={() => setResult(null)}>Изменить цены</button>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="bar">
        <label className="pb-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти товар" aria-label="Найти товар" />
        </label>
      </div>

      {items.length === 0 && <div className="cards__note">Список товаров пока пуст. Вы можете предложить свои товары ниже.</div>}

      {groups.map(([cat, list]) => (
        <section key={cat} className="offer-group">
          <h2 className="offer-group__title">{cat} <span className="num muted">{list.length}</span></h2>
          {list.map((it) => (
            <div key={it.id} className="offer-row">
              <div className="offer-row__name">
                <span>{it.name}</span>
                <span className="muted">за {it.unit}{it.id in lastMine ? ` · ваша прошлая цена ${num(lastMine[it.id])} ₽` : ''}</span>
              </div>
              <label className="offer-row__price">
                <span className="sr">Цена за {it.unit}, ₽</span>
                <input className="input num" inputMode="decimal" placeholder="Цена, ₽" value={prices[it.id] ?? ''} onChange={(e) => setPrices({ ...prices, [it.id]: e.target.value })} />
              </label>
              <label className="offer-row__qty">
                <span className="sr">Минимальная партия</span>
                <input className="input" placeholder="Мин. партия" value={minQty[it.id] ?? ''} onChange={(e) => setMinQty({ ...minQty, [it.id]: e.target.value })} />
              </label>
            </div>
          ))}
        </section>
      ))}

      <section className="offer-group">
        <h2 className="offer-group__title">Предложить другой товар</h2>
        {custom.map((c, i) => (
          <div key={c.key} className="offer-row offer-row--custom">
            <input className="input" placeholder="Название товара" value={c.name} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Название товара" />
            <input className="input" placeholder="Ед. (кг, шт)" value={c.unit} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} aria-label="Единица измерения" />
            <input className="input num" inputMode="decimal" placeholder="Цена, ₽" value={c.price} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} aria-label="Цена" />
            <button type="button" className="pb-btn pb-btn--quiet pb-btn--sm" onClick={() => setCustom(custom.filter((_, j) => j !== i))} aria-label="Убрать строку">×</button>
          </div>
        ))}
        <div><button type="button" className="pb-btn pb-btn--sm" onClick={() => setCustom([...custom, { key: Date.now(), name: '', unit: '', price: '' }])}>+ Добавить товар</button></div>
      </section>

      <section className="card-box">
        <div className="row-form">
          <div className="field"><label htmlFor="valid">Цены действуют до</label><input className="input" id="valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
          <div className="field"><label htmlFor="contact">Ваше имя или телефон</label><input className="input" id="contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Необязательно" /></div>
        </div>
        <div className="field"><label htmlFor="comment">Комментарий</label><textarea className="input textarea" id="comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Условия доставки, оплаты, сроки" /></div>
      </section>

      <div className="offer-submit">
        {error && <p className="err" role="alert">{error}</p>}
        <button type="button" className="pb-btn pb-btn--primary" disabled={busy} onClick={submit}>{busy ? 'Отправляем…' : `Отправить цены${filled ? ` (${filled})` : ''}`}</button>
      </div>
    </>
  );
}

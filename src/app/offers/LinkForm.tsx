'use client';
import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createLink } from './actions';
import { CopyButton } from './CopyButton';

interface Props {
  suppliers: { id: string; name: string }[];
  categories: [string, number][];
  items: { id: string; name: string; category: string }[];
}

function Submit() {
  const { pending } = useFormStatus();
  return <button className="pb-btn pb-btn--primary" type="submit" disabled={pending}>{pending ? 'Создаём…' : 'Создать ссылку'}</button>;
}

export function LinkForm({ suppliers, categories, items }: Props) {
  const [state, action] = useFormState(createLink, null);
  const [supplierId, setSupplierId] = useState('');
  const [scope, setScope] = useState<'supplier_items' | 'categories' | 'items'>('categories');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? items.filter((i) => i.name.toLowerCase().includes(s) || i.category.toLowerCase().includes(s)) : items).slice(0, 300);
  }, [items, q]);

  return (
    <form action={action} className="card-box">
      <h2>Новая ссылка для поставщика</h2>

      <div className="row-form">
        <div className="field">
          <label htmlFor="supplier_id">Поставщик из 1С</label>
          <select className="select" id="supplier_id" name="supplier_id" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); if (!e.target.value && scope === 'supplier_items') setScope('categories'); }}>
            <option value="">— новая фирма, впишу название —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="company_name">{supplierId ? 'Название на странице (можно оставить пустым)' : 'Название фирмы'}</label>
          <input className="input" id="company_name" name="company_name" placeholder={supplierId ? 'Как в 1С' : 'Например, ООО «Агро-Юг»'} />
        </div>
      </div>

      <div className="field">
        <label>Какие товары увидит поставщик</label>
        <div className="radio-row">
          <label><input type="radio" name="scope" value="supplier_items" checked={scope === 'supplier_items'} disabled={!supplierId} onChange={() => setScope('supplier_items')} /> Товары, которые мы у него берём</label>
          <label><input type="radio" name="scope" value="categories" checked={scope === 'categories'} onChange={() => setScope('categories')} /> Разделы</label>
          <label><input type="radio" name="scope" value="items" checked={scope === 'items'} onChange={() => setScope('items')} /> Подборка товаров</label>
        </div>
      </div>

      {scope === 'categories' && (
        <div className="checks" role="group" aria-label="Разделы">
          {categories.map(([c, n]) => (
            <label key={c}><input type="checkbox" name="categories" value={c} /> {c} <span className="muted num">{n}</span></label>
          ))}
        </div>
      )}

      {scope === 'items' && (
        <div className="field">
          <label className="pb-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти товар или раздел" aria-label="Найти товар" />
          </label>
          <div className="checks" role="group" aria-label="Товары">
            {shown.map((i) => (
              <label key={i.id}>
                <input type="checkbox" checked={picked.has(i.id)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(i.id); else n.delete(i.id); setPicked(n); }} />
                {i.name}
              </label>
            ))}
          </div>
          {[...picked].map((id) => <input key={id} type="hidden" name="item_ids" value={id} />)}
          <span className="muted" style={{ fontSize: 12 }}>Выбрано: {picked.size}{shown.length === 300 ? ' · показаны первые 300, уточните поиск' : ''}</span>
        </div>
      )}

      <div className="row-form">
        <div className="field" style={{ flex: '0 1 220px' }}>
          <label htmlFor="expires_days">Срок действия</label>
          <select className="select" id="expires_days" name="expires_days" defaultValue="0">
            <option value="0">Бессрочно</option>
            <option value="7">7 дней</option>
            <option value="30">30 дней</option>
            <option value="90">90 дней</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="note">Сообщение поставщику (необязательно)</label>
          <input className="input" id="note" name="note" placeholder="Например: нужны цены с доставкой до склада на МКАД" />
        </div>
      </div>

      <div className="acts"><Submit /></div>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.url && (
        <div className="notice" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <span>{state.ok}</span>
          <span className="link-url">{state.url}</span>
          <div><CopyButton text={state.url} /></div>
        </div>
      )}
    </form>
  );
}

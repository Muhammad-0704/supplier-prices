'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface PickerOption { value: string; label: string; count?: number; hint?: string }

/**
 * Выпадающий список с поиском: для категорий и поставщиков, где вариантов десятки.
 * Клавиатура: ↑ ↓ — выбор, Enter — применить, Escape — закрыть. Можно сразу печатать.
 */
export function Picker({ label, value, options, allLabel, onChange, searchPlaceholder = 'Найти' }: {
  label: string;
  value: string;
  options: PickerOption[];
  /** Пункт «Все …» со значением 'all' */
  allLabel: string;
  onChange: (v: string) => void;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  const all: PickerOption = { value: 'all', label: allLabel };
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const f = s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
    return s ? f : [all, ...f];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, options, allLabel]);
  const current = value === 'all' ? null : options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, shown.findIndex((o) => o.value === value)));
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQ('');
    btn.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active].value); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); setQ(''); btn.current?.focus(); }
  }

  return (
    <div className="pk" ref={root}>
      <button ref={btn} type="button" className={`pk__btn${current ? ' pk__btn--on' : ''}`} aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}>
        <span className="pk__val">{current ? current.label : allLabel}</span>
        {current && <span className="pk__clear" role="button" aria-label={`Сбросить: ${label}`} onClick={(e) => { e.stopPropagation(); pick('all'); }}>×</span>}
        <svg className="pk__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="pk__pop" onKeyDown={onKey}>
          <div className="pk__search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder}
              role="combobox" aria-expanded="true" aria-controls={id} aria-activedescendant={shown[active] ? `${id}-${active}` : undefined} />
          </div>
          <div className="pk__list" role="listbox" id={id} ref={list} aria-label={label}>
            {shown.map((o, i) => (
              <div key={o.value} id={`${id}-${i}`} data-i={i} role="option" aria-selected={o.value === value}
                className={`pk__opt${i === active ? ' pk__opt--active' : ''}${o.value === 'all' ? ' pk__opt--all' : ''}`}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.value)}>
                <span className="pk__check" aria-hidden="true">{o.value === value ? '✓' : ''}</span>
                <span className="pk__label">{o.label}{o.hint && <span className="pk__hint">{o.hint}</span>}</span>
                {o.count != null && <span className="pk__count">{o.count}</span>}
              </div>
            ))}
            {!shown.length && <div className="pk__empty">Ничего не нашлось</div>}
          </div>
        </div>
      )}
    </div>
  );
}

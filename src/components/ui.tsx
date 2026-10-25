'use client';
/**
 * Компоненты дизайн-системы «Прайс-доска» на TypeScript. Классы и поведение совпадают с bundle.js дизайн-системы.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { num, pct, plural, rub } from '@/lib/format';

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export function Trend({ value, zeroLabel }: { value?: number; zeroLabel?: string }) {
  if (!value) return zeroLabel ? <span className="pb-trend">{zeroLabel}</span> : null;
  return (
    <span className={cx('pb-trend', value > 0 ? 'pb-trend--rise' : 'pb-trend--drop')} title={(value > 0 ? 'Подорожало на ' : 'Подешевело на ') + pct(value)}>
      {value > 0 ? '▲' : '▼'}
      {pct(value)}
    </span>
  );
}

export interface PriceCellProps {
  price: number | null;
  trend?: number;
  date?: string;
  best?: boolean;
  current?: boolean;
  stale?: boolean;
  highlight?: boolean;
  compact?: boolean;
  title?: string;
  onOpen?: () => void;
}

export function PriceCell(p: PriceCellProps) {
  if (p.price == null) {
    return <div className={cx('pb-cell', 'pb-cell--empty', p.compact && 'pb-cell--compact', p.highlight && 'pb-cell--highlight')}>·</div>;
  }
  return (
    <div
      role="button"
      tabIndex={0}
      title={p.title}
      onClick={p.onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onOpen?.(); } }}
      className={cx('pb-cell', p.best && 'pb-cell--best', p.current && 'pb-cell--current', p.stale && 'pb-cell--stale', p.highlight && 'pb-cell--highlight', p.compact && 'pb-cell--compact')}
    >
      <span className="pb-cell__price">{num(p.price)}</span>
      <span className="pb-cell__meta">
        <Trend value={p.trend} />
        {p.date && <span>{p.date}</span>}
      </span>
    </div>
  );
}

const BADGE_TEXT: Record<string, string> = { best: 'лучшая', current: 'берём сейчас', stale: 'устарела' };
export function Badge({ tone = 'neutral', children }: { tone?: 'best' | 'current' | 'stale' | 'rise' | 'drop' | 'role' | 'neutral'; children?: ReactNode }) {
  return <span className={cx('pb-badge', `pb-badge--${tone}`)}>{children ?? BADGE_TEXT[tone] ?? ''}</span>;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'quiet';
  size?: 'md' | 'sm';
  icon?: ReactNode;
  busy?: boolean;
}
export function Button({ variant = 'secondary', size = 'md', icon, busy, className, children, ...rest }: ButtonProps) {
  return (
    <button type="button" {...rest} aria-busy={busy || undefined} className={cx('pb-btn', `pb-btn--${variant}`, size === 'sm' && 'pb-btn--sm', className)}>
      {icon && <span className="pb-btn__icon" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}

export function Chip({ pressed, count, onClick, children }: { pressed?: boolean; count?: number; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className="pb-chip" aria-pressed={pressed ? 'true' : 'false'} onClick={onClick}>
      {children}
      {count != null && <span className="pb-chip__count">{count}</span>}
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="pb-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value ? 'true' : 'false'} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <span className="pb-seg__count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchField({ value, onValueChange, placeholder = 'Найти товар' }: { value: string; onValueChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="pb-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input type="search" autoComplete="off" value={value} placeholder={placeholder} onChange={(e) => onValueChange(e.target.value)} aria-label="Поиск товара" />
    </label>
  );
}

export function SyncStatus({ state = 'ok', label }: { state?: 'ok' | 'syncing' | 'error'; label: string }) {
  return (
    <span className={cx('pb-sync', `pb-sync--${state}`)} role="status">
      <span className="pb-sync__dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function StatStrip({ items }: { items: { label: string; value: string; sub?: ReactNode; tone?: 'good' | 'bad' }[] }) {
  return (
    <div className="pb-stats">
      {items.map((it) => (
        <div key={it.label} className="pb-stats__item">
          <span className="pb-stats__label">{it.label}</span>
          <span className={cx('pb-stats__value', it.tone && `pb-stats__value--${it.tone}`)}>{it.value}</span>
          {it.sub && <span className="pb-stats__sub">{it.sub}</span>}
        </div>
      ))}
    </div>
  );
}

export interface ItemCardProps {
  name: string;
  meta?: string;
  best?: { price: number; supplier: string };
  current?: { price: number; supplier: string };
  overpay?: number;
  suppliers?: number;
  favorite?: boolean;
  onClick?: () => void;
}
export function ItemCard(p: ItemCardProps) {
  const n = p.suppliers ?? 0;
  const supText = `${n} ${plural(n, 'поставщик', 'поставщика', 'поставщиков')}`;
  return (
    <button type="button" className="pb-card" onClick={p.onClick}>
      <span className="pb-card__head">
        <span className="pb-card__name">
          {p.favorite && <span className="pb-card__star" aria-label="избранное">★</span>}
          {p.name}
        </span>
        {p.meta && <span className="pb-card__meta">{p.meta}</span>}
      </span>
      <span className="pb-card__grid">
        {p.best && (
          <span className="pb-card__col">
            <span className="pb-card__label">Лучшая цена</span>
            <span className="pb-card__price pb-card__price--best">{rub(p.best.price)}</span>
            <span className="pb-card__sup">{p.best.supplier}</span>
          </span>
        )}
        {p.current && (
          <span className="pb-card__col">
            <span className="pb-card__label">Берём сейчас</span>
            <span className="pb-card__price">{rub(p.current.price)}</span>
            <span className="pb-card__sup">{p.current.supplier}</span>
          </span>
        )}
      </span>
      <span className="pb-card__foot">
        {p.overpay == null ? supText : p.overpay > 0 ? (
          <>{supText} · переплата <b>{rub(p.overpay)}/мес</b></>
        ) : (
          <>{supText} · <span className="pb-ok">берём по лучшей цене</span></>
        )}
      </span>
    </button>
  );
}

export const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 4v5h-5" />
  </svg>
);

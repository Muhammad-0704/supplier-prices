import Link from 'next/link';
import { monthRange, monthTitle, mskMonth } from '@/lib/canteens';

/** ← Октябрь 2026 → ; вперёд дальше текущего месяца не листается */
export function MonthNav({ month, base }: { month: string; base: string }) {
  const { prev, next } = monthRange(month);
  const canNext = next <= mskMonth();
  const href = (m: string) => `${base}${base.includes('?') ? '&' : '?'}month=${m}`;
  return (
    <div className="cn-month" role="group" aria-label="Месяц">
      <Link className="pb-btn pb-btn--quiet pb-btn--sm" href={href(prev)} aria-label="Предыдущий месяц">←</Link>
      <b>{monthTitle(month)}</b>
      {canNext ? <Link className="pb-btn pb-btn--quiet pb-btn--sm" href={href(next)} aria-label="Следующий месяц">→</Link> : <span className="pb-btn pb-btn--quiet pb-btn--sm" aria-hidden="true" style={{ visibility: 'hidden' }}>→</span>}
    </div>
  );
}

import Link from 'next/link';

/** Разделы страницы точки */
export function PointTabs({ id, month, current }: { id: string; month: string; current: 'main' | 'sales' }) {
  return (
    <nav className="cn-tabs" aria-label="Разделы точки">
      <Link href={`/canteens/${id}?month=${month}`} aria-current={current === 'main' ? 'page' : undefined}>Отчёт и закупки</Link>
      <Link href={`/canteens/${id}/sales?month=${month}`} aria-current={current === 'sales' ? 'page' : undefined}>Продажи</Link>
    </nav>
  );
}

import Link from 'next/link';
import type { Access, CanteenRole } from '@/lib/access';
import { ThemeToggle } from '../ThemeToggle';
import { Badge } from '../ui';

export function CanteenHeader({ me, current }: { me: Access & { canteenRole: CanteenRole }; current: 'points' | 'access' }) {
  const manager = me.canteenRole === 'manager';
  return (
    <header className="top">
      <div className="brand">
        <Link href={me.services.length > 1 ? '/' : '/canteens'} className="brand__home" aria-label="На главную" tabIndex={-1}>
          <span className="brand__mark brand__mark--canteens" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
        </Link>
        <div>
          <Link href="/canteens" className="brand__home"><h1>Столовые</h1></Link>
          <div className="brand__sub">
            {me.name} <Badge tone="role">{manager ? 'руководитель' : 'админ точки'}</Badge>
          </div>
        </div>
      </div>
      <div className="top__right">
        <nav className="nav" aria-label="Разделы">
          <Link href="/canteens" aria-current={current === 'points' ? 'page' : undefined}>Точки</Link>
          {manager && <Link href="/canteens/access" aria-current={current === 'access' ? 'page' : undefined}>Доступы</Link>}
          {me.services.length > 1 && <Link href="/">Все сервисы</Link>}
          <ThemeToggle />
          <form action="/auth/signout" method="post"><button className="pb-btn pb-btn--quiet pb-btn--sm" type="submit">Выйти</button></form>
        </nav>
      </div>
    </header>
  );
}

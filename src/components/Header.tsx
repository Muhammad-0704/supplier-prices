import Link from 'next/link';
import type { Role } from '@/lib/types';
import { Badge } from './ui';

export function Header({ role, userName, current, children }: { role: Role; userName: string; current: 'board' | 'team'; children?: React.ReactNode }) {
  return (
    <header className="top">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
        <div>
          <h1>Прайс-доска</h1>
          <div className="brand__sub">
            {userName} <Badge tone="role">{role === 'manager' ? 'руководитель' : 'сотрудник'}</Badge>
          </div>
        </div>
      </div>
      <div className="top__right">
        <nav className="nav" aria-label="Разделы">
          <Link href="/" aria-current={current === 'board' ? 'page' : undefined}>Доска</Link>
          {role === 'manager' && <Link href="/team" aria-current={current === 'team' ? 'page' : undefined}>Команда</Link>}
          <Link href="/account">Пароль</Link>
          <form action="/auth/signout" method="post"><button className="pb-btn pb-btn--quiet pb-btn--sm" type="submit">Выйти</button></form>
        </nav>
        {children}
      </div>
    </header>
  );
}

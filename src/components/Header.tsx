import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/types';
import { ThemeToggle } from './ThemeToggle';
import { Badge } from './ui';

export async function Header({ role, userName, current, children }: { role: Role; userName: string; current: 'board' | 'team' | 'offers' | 'order'; children?: React.ReactNode }) {
  // Счётчик новых предложений от поставщиков — только руководителю
  let newOffers = 0;
  if (role === 'manager') {
    const { count } = await createClient().from('offer_lines').select('id', { count: 'exact', head: true }).eq('status', 'new');
    newOffers = count ?? 0;
  }
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
          <Link href="/order" aria-current={current === 'order' ? 'page' : undefined}>Заказ</Link>
          {role === 'manager' && (
            <Link href="/offers" aria-current={current === 'offers' ? 'page' : undefined}>
              Предложения{newOffers > 0 && <span className="cnt-new" aria-label={`новых: ${newOffers}`}>{newOffers}</span>}
            </Link>
          )}
          {role === 'manager' && <Link href="/team" aria-current={current === 'team' ? 'page' : undefined}>Команда</Link>}
          <Link href="/account">Пароль</Link>
          <ThemeToggle />
          <form action="/auth/signout" method="post"><button className="pb-btn pb-btn--quiet pb-btn--sm" type="submit">Выйти</button></form>
        </nav>
        {children}
      </div>
    </header>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SERVICES, getAccess } from '@/lib/access';

export const dynamic = 'force-dynamic';

/** Общий вход платформы: плитки только тех сервисов, к которым у человека есть доступ. Один сервис — сразу в него. */
export default async function HomePage() {
  const me = await getAccess();
  if (me.services.length === 1) redirect(SERVICES[me.services[0]].href);

  return (
    <main className="page home">
      <header className="top">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
          <div>
            <h1>База</h1>
            <div className="brand__sub">{me.name}</div>
          </div>
        </div>
        <div className="top__right">
          <nav className="nav" aria-label="Аккаунт">
            <ThemeToggle />
            <form action="/auth/signout" method="post"><button className="pb-btn pb-btn--quiet pb-btn--sm" type="submit">Выйти</button></form>
          </nav>
        </div>
      </header>
      {me.services.length === 0 ? (
        <div className="notice">Вам пока не выдали доступ ни к одному сервису. Попросите руководителя открыть нужный раздел.</div>
      ) : (
        <div className="tiles">
          {me.services.map((s) => (
            <Link key={s} href={SERVICES[s].href} className="tile">
              <span className="tile__title">{SERVICES[s].title}</span>
              <span className="tile__about">{SERVICES[s].about}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

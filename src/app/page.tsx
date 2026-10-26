import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BazaLogo, FoodLogo, PriceLogo } from '@/components/Logos';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SERVICES, getAccess, type ServiceId } from '@/lib/access';

export const dynamic = 'force-dynamic';

const LOGO: Record<ServiceId, (p: { size?: number }) => JSX.Element> = { price: PriceLogo, canteens: FoodLogo };

/** Общий вход: что такое База и плитки только тех сервисов, к которым у человека есть доступ. Один сервис — сразу в него. */
export default async function HomePage() {
  const me = await getAccess();
  if (me.services.length === 1) redirect(SERVICES[me.services[0]].href);

  return (
    <main className="home">
      <div className="home__bar">
        <span className="muted">{me.name}</span>
        <ThemeToggle />
        <form action="/auth/signout" method="post"><button className="pb-btn pb-btn--quiet pb-btn--sm" type="submit">Выйти</button></form>
      </div>

      <section className="home__hero">
        <BazaLogo size={56} />
        <h1>База</h1>
        <p className="home__lead">
          Экосистема склада и сети «Центр Питания»: цены поставщиков, закупки точек и их отчёты — в одном месте и под одним входом.
          Данные приходят из 1С сами, каждые 10 минут.
        </p>
      </section>

      {me.services.length === 0 ? (
        <div className="notice home__notice">Вам пока не выдали доступ ни к одному сервису. Попросите руководителя открыть нужный раздел.</div>
      ) : (
        <div className="home__tiles">
          {me.services.map((s) => {
            const svc = SERVICES[s];
            const Logo = LOGO[s];
            return (
              <Link key={s} href={svc.href} className={`home-tile home-tile--${s}`}>
                <span className="home-tile__head">
                  <Logo size={44} />
                  <span>
                    <span className="home-tile__title">{svc.title}</span>
                    <span className="home-tile__about">{svc.about}</span>
                  </span>
                </span>
                <ul className="home-tile__list">
                  {svc.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
                <span className="home-tile__go">Открыть <span aria-hidden="true">→</span></span>
              </Link>
            );
          })}
        </div>
      )}

      <p className="home__soon">Дальше в экосистеме: склад и отчётность по всей группе.</p>
    </main>
  );
}

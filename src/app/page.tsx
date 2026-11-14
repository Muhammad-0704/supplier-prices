import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { FoodLogo, PriceLogo } from '@/components/Logos';
import { WorkspaceShell, type WorkspaceLink } from '@/components/WorkspaceShell';
import { SERVICES, getAccess, type ServiceId } from '@/lib/access';

export const dynamic = 'force-dynamic';

const LOGO: Record<ServiceId, (p: { size?: number }) => JSX.Element> = { price: PriceLogo, canteens: FoodLogo };
const NAV_ID = { price: 'board', canteens: 'points' } as const;

/** Общий вход: что такое База и плитки только тех сервисов, к которым у человека есть доступ. Один сервис — сразу в него. */
export default async function HomePage() {
  const me = await getAccess();
  if (me.services.length === 1) redirect(SERVICES[me.services[0]].href);

  const links: WorkspaceLink[] = [
    { id: 'home', label: 'Все сервисы', href: '/' },
    ...me.services.map((service) => ({ id: NAV_ID[service], label: SERVICES[service].title, href: SERVICES[service].href })),
  ];

  return (
    <WorkspaceShell title="Все сервисы" current="home" group="Рабочая область" userName={me.name} links={links}>
      {me.services.length === 0 ? (
        <div className="notice">Вам пока не выдали доступ ни к одному сервису. Попросите руководителя открыть нужный раздел.</div>
      ) : (
        <div className="home__tiles">
          {me.services.map((s) => {
            const svc = SERVICES[s];
            const Logo = LOGO[s];
            return (
              <Link key={s} href={svc.href} className="home-tile">
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
                <span className="home-tile__go">Открыть <ArrowUpRight size={15} aria-hidden="true" /></span>
              </Link>
            );
          })}
        </div>
      )}

    </WorkspaceShell>
  );
}

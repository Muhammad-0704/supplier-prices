import type { Access, CanteenRole } from '@/lib/access';
import { WorkspaceShell, type WorkspaceLink } from '../WorkspaceShell';

export function CanteenHeader({ me, current, children }: {
  me: Access & { canteenRole: CanteenRole };
  current: 'points' | 'markup' | 'access';
  children: React.ReactNode;
}) {
  const manager = me.canteenRole === 'manager';
  const links: WorkspaceLink[] = [{ id: 'points', label: 'Точки', href: '/canteens' }];
  if (manager) links.push({ id: 'access', label: 'Доступы', href: '/canteens/access' });
  const title = current === 'access' ? 'Доступы к точкам' : current === 'markup' ? 'Наценка склада' : 'Центр Питания';
  return (
    <WorkspaceShell title={title} group="Центр Питания" userName={me.name} role={manager ? 'Руководитель' : 'Админ точки'} current={current} links={links} showServiceLink={me.services.length > 1}>
      {children}
    </WorkspaceShell>
  );
}
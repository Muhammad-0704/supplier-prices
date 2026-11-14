import { createClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/types';
import { WorkspaceShell, type WorkspaceLink } from './WorkspaceShell';

const titles = {
  board: 'Прайс-доска',
  order: 'Заявка поставщикам',
  offers: 'Предложения поставщиков',
  settings: 'Настройки',
};

export async function Header({ role, userName, current, children }: {
  role: Role;
  userName: string;
  current: keyof typeof titles;
  children: React.ReactNode;
}) {
  const links: WorkspaceLink[] = [
    { id: 'board', label: 'Доска', href: '/price' },
    { id: 'order', label: 'Заявка', href: '/order' },
  ];
  if (role === 'manager') {
    const { count } = await createClient().from('offer_lines').select('id', { count: 'exact', head: true }).eq('status', 'new');
    links.push({ id: 'offers', label: 'Предложения', href: '/offers', count: count || undefined });
  }
  links.push({ id: 'settings', label: 'Настройки', href: '/settings' });

  return (
    <WorkspaceShell title={titles[current]} group="Прайс-доска" userName={userName} role={role === 'manager' ? 'Руководитель' : 'Сотрудник'} current={current} links={links}>
      {children}
    </WorkspaceShell>
  );
}
'use client';

import Link from 'next/link';
import {
  ArrowUpRight, Building2, ClipboardList, House, LayoutGrid, Settings, Tags, Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DashboardShell } from './block/dashboard-shell';
import { BazaLogo } from './Logos';
import { ThemeToggle } from './ThemeToggle';

const icons = {
  home: House,
  board: LayoutGrid,
  order: ClipboardList,
  offers: Tags,
  settings: Settings,
  points: Building2,
  access: Users,
  markup: Tags,
} as const;

export type WorkspaceLink = {
  id: keyof typeof icons;
  label: string;
  href: string;
  count?: number;
};

export function WorkspaceShell({ title, userName, role, current, group, links, children, showServiceLink = true }: {
  title: string;
  userName: string;
  role?: string;
  current: WorkspaceLink['id'];
  group: string;
  links: WorkspaceLink[];
  children: ReactNode;
  showServiceLink?: boolean;
}) {
  return (
    <div className="workspace-frame">
      <DashboardShell
        className="workspace-shell"
        brand={{ name: 'База', description: group, logo: <BazaLogo size={32} /> }}
        navigation={[{ id: 'workspace', title: group, items: links.map((link) => ({ ...link, icon: icons[link.id] })) }]}
        secondaryNavigation={current !== 'home' && showServiceLink ? [{ id: 'home', label: 'Все сервисы', href: '/', icon: ArrowUpRight }] : undefined}
        sidebarFooter={
          <div className="workspace-user">
            <span className="workspace-user__icon"><Users size={16} aria-hidden="true" /></span>
            <div className="workspace-user__identity">
              <strong title={userName}>{userName || 'Профиль'}</strong>
              {role && <span>{role}</span>}
            </div>
          </div>
        }
        headerActions={<div className="workspace-actions">
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <button type="submit" className="pb-btn pb-btn--quiet pb-btn--sm">Выйти</button>
          </form>
        </div>}
        title={title}
        activeItemId={current}
        linkComponent={Link}
        navigationLabel="Навигация по сервису"
        defaultSidebarWidth={224}
        minSidebarWidth={182}
        maxSidebarWidth={320}
      >
        <main className="page workspace-content">{children}</main>
      </DashboardShell>
    </div>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { Badge } from '@/components/ui';
import { loadThresholds } from '@/lib/alert-runner';
import { longDate, time } from '@/lib/format';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getChatId, telegramConfigured } from '@/lib/telegram';
import type { Role } from '@/lib/types';
import { AddMemberForm } from './AddMemberForm';
import { AlertSettings } from './AlertSettings';
import { OrderDigestCard } from './OrderDigestCard';
import { PasswordForm } from './PasswordForm';
import { RoleSelect } from './RoleSelect';
import { TelegramConnect } from './TelegramConnect';
import { removeMember } from './team-actions';

export const dynamic = 'force-dynamic';

type Tab = 'profile' | 'team' | 'notify' | 'onec';
const TABS: { id: Tab; label: string; manager: boolean }[] = [
  { id: 'profile', label: 'Профиль', manager: false },
  { id: 'team', label: 'Команда', manager: true },
  { id: 'notify', label: 'Уведомления', manager: true },
  { id: 'onec', label: '1С', manager: true },
];

export default async function SettingsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await db.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
  if (!me) redirect('/');
  const role: Role = me.role === 'manager' ? 'manager' : 'staff';
  const tabs = TABS.filter((t) => !t.manager || role === 'manager');
  const tab = (tabs.find((t) => t.id === searchParams.tab) ?? tabs[0]).id;

  return (
    <main className="page">
      <Header role={role} userName={me.full_name || ''} current="settings" />
      {tabs.length > 1 && (
        <nav className="tabs" aria-label="Разделы настроек">
          {tabs.map((t) => <Link key={t.id} href={t.id === 'profile' ? '/settings' : `/settings?tab=${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>{t.label}</Link>)}
        </nav>
      )}
      <div className="settings">
        {tab === 'profile' && <ProfileTab name={me.full_name || ''} email={user.email ?? ''} role={role} />}
        {tab === 'team' && <TeamTab meId={user.id} />}
        {tab === 'notify' && <NotifyTab />}
        {tab === 'onec' && <OnecTab />}
      </div>
    </main>
  );
}

function ProfileTab({ name, email, role }: { name: string; email: string; role: Role }) {
  return (
    <>
      <section className="card-box">
        <h2>Профиль</h2>
        <div className="profile-row">
          <div>
            <b>{name || email}</b> <Badge tone="role">{role === 'manager' ? 'руководитель' : 'сотрудник'}</Badge>
            {name && <div className="muted" style={{ fontSize: 13 }}>{email}</div>}
          </div>
          <form action="/auth/signout" method="post"><button className="pb-btn" type="submit">Выйти</button></form>
        </div>
      </section>
      <PasswordForm />
    </>
  );
}

async function TeamTab({ meId }: { meId: string }) {
  const db = createClient();
  const [{ data: profiles }, users] = await Promise.all([
    db.from('profiles').select('id, full_name, role, created_at').order('created_at'),
    createAdminClient().auth.admin.listUsers({ perPage: 200 }),
  ]);
  const emails = new Map((users.data?.users ?? []).map((u) => [u.id, u.email ?? '']));
  return (
    <>
      <section className="card-box">
        <h2>Команда</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="team">
            <thead><tr><th>Имя</th><th>Почта</th><th>Роль</th><th /></tr></thead>
            <tbody>
              {(profiles ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{p.full_name}{p.id === meId && <span className="muted"> (вы)</span>}</td>
                  <td className="muted">{emails.get(p.id)}</td>
                  <td>{p.id === meId ? <Badge tone="role">руководитель</Badge> : <RoleSelect id={p.id} role={p.role} />}</td>
                  <td style={{ textAlign: 'right' }}>
                    {p.id !== meId && (
                      <details className="confirm">
                        <summary className="pb-btn pb-btn--quiet pb-btn--sm">Удалить</summary>
                        <form action={removeMember}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="pb-btn pb-btn--sm" type="submit" style={{ color: 'var(--bad)' }}>Да, удалить доступ</button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <AddMemberForm />
    </>
  );
}

async function NotifyTab() {
  const db = createClient();
  const [chatId, th] = await Promise.all([getChatId(db), loadThresholds(db)]);
  const connected = telegramConfigured() && !!chatId;
  return (
    <>
      <TelegramConnect configured={telegramConfigured()} connected={!!chatId} />
      <AlertSettings up={Math.round(th.up * 100)} down={Math.round(th.down * 100)} connected={connected} />
      <OrderDigestCard connected={connected} />
    </>
  );
}

async function OnecTab() {
  const db = createClient();
  const { data: runs } = await db.from('sync_runs').select('id, started_at, status, trigger, message').order('started_at', { ascending: false }).limit(20);
  return (
    <section className="card-box">
      <h2>Синхронизации с 1С</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Данные приходят из 1С сами каждые 10 минут с 8:00 до 01:00. Здесь последние 20 запусков.</p>
      {runs?.length ? (
        <ul className="runs">
          {runs.map((r) => (
            <li key={r.id}>
              <span className="num">{longDate(r.started_at)}, {time(r.started_at)}</span>
              <span>{r.status === 'ok' ? <Badge tone="best">готово</Badge> : r.status === 'error' ? <Badge tone="rise">ошибка</Badge> : <Badge>идёт</Badge>}</span>
              <span className="muted">{r.trigger === 'cron' ? 'По расписанию. ' : 'Вручную. '}{r.message}</span>
            </li>
          ))}
        </ul>
      ) : <p className="muted" style={{ margin: 0 }}>Синхронизаций ещё не было.</p>}
    </section>
  );
}

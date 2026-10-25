import { redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { Badge } from '@/components/ui';
import { longDate, time } from '@/lib/format';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { AddMemberForm } from './AddMemberForm';
import { removeMember, setRole } from './actions';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await db.from('profiles').select('role, full_name').eq('id', user.id).single();
  if (me?.role !== 'manager') redirect('/');

  const [{ data: profiles }, { data: runs }, users] = await Promise.all([
    db.from('profiles').select('id, full_name, role, created_at').order('created_at'),
    db.from('sync_runs').select('id, started_at, status, trigger, message').order('started_at', { ascending: false }).limit(15),
    createAdminClient().auth.admin.listUsers({ perPage: 200 }),
  ]);
  const emails = new Map((users.data?.users ?? []).map((u) => [u.id, u.email ?? '']));

  return (
    <main className="page">
      <Header role="manager" userName={me.full_name || ''} current="team" />

      <section className="card-box">
        <h2>Команда</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="team">
            <thead><tr><th>Имя</th><th>Почта</th><th>Роль</th><th /></tr></thead>
            <tbody>
              {(profiles ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{p.full_name}{p.id === user.id && <span className="muted"> (вы)</span>}</td>
                  <td className="muted">{emails.get(p.id)}</td>
                  <td>
                    {p.id === user.id ? <Badge tone="role">руководитель</Badge> : (
                      <form action={setRole} style={{ display: 'flex', gap: 8 }}>
                        <input type="hidden" name="id" value={p.id} />
                        <select className="select" name="role" defaultValue={p.role} aria-label="Роль">
                          <option value="staff">Сотрудник</option>
                          <option value="manager">Руководитель</option>
                        </select>
                        <button className="pb-btn pb-btn--sm" type="submit">Сохранить</button>
                      </form>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {p.id !== user.id && (
                      <details>
                        <summary className="pb-btn pb-btn--quiet pb-btn--sm" style={{ listStyle: 'none' }}>Удалить</summary>
                        <form action={removeMember} style={{ marginTop: 6 }}>
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

      <section className="card-box">
        <h2>Синхронизации с 1С</h2>
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
    </main>
  );
}

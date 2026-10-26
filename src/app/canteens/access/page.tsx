import { redirect } from 'next/navigation';
import { AddCanteenUserForm } from '@/components/canteens/AddCanteenUserForm';
import { CanteenHeader } from '@/components/canteens/CanteenHeader';
import { Badge } from '@/components/ui';
import { requireCanteens } from '@/lib/access';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { linkCustomer, revokeCanteenUser, updateCanteenUser } from '../actions';

export const dynamic = 'force-dynamic';

/** Руководитель: кто видит какие точки и какой покупатель 1С — какая точка. */
export default async function AccessPage() {
  const me = await requireCanteens();
  if (me.canteenRole !== 'manager') redirect('/canteens');
  const db = createClient();
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const [{ data: canteens }, { data: links }, { data: people }, { data: admins }, { data: buyers }, users] = await Promise.all([
    db.from('canteens').select('id, name').order('sort').order('name'),
    db.from('canteen_customers').select('customer_id, canteen_id'),
    db.from('profiles').select('id, full_name, role, canteen_role').not('canteen_role', 'is', null).order('created_at'),
    db.from('canteen_admins').select('user_id, canteen_id'),
    // Покупатели, на которых были расходные за 90 дней: подсказка, кого привязывать
    db.from('shipments').select('customer_id').gte('doc_date', since).limit(5000),
    createAdminClient().auth.admin.listUsers({ perPage: 200 }),
  ]);
  const emails = new Map((users.data?.users ?? []).map((u) => [u.id, u.email ?? '']));
  const cs = canteens ?? [];
  const buyerIds = [...new Set((buyers ?? []).map((b) => b.customer_id))];
  const linked = new Map((links ?? []).map((l) => [l.customer_id, l.canteen_id]));
  const ids = [...new Set([...buyerIds, ...linked.keys()])];
  const { data: names } = ids.length ? await db.from('suppliers').select('id, name').in('id', ids) : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((names ?? []).map((n) => [n.id, n.name]));
  const customers = ids.map((id) => ({ id, name: nameOf.get(id) ?? '—', canteen: linked.get(id) ?? '', active: buyerIds.includes(id) }))
    .sort((a, b) => Number(!!b.canteen) - Number(!!a.canteen) || a.name.localeCompare(b.name, 'ru'));

  return (
    <main className="page">
      <CanteenHeader me={me} current="access" />
      <div className="settings">
        <section className="card-box">
          <h2>Люди</h2>
          <div className="cn-scroll">
            <table className="team">
              <thead><tr><th>Имя</th><th>Роль и точки</th><th /></tr></thead>
              <tbody>
                {(people ?? []).map((p) => {
                  const mine = new Set((admins ?? []).filter((a) => a.user_id === p.id).map((a) => a.canteen_id));
                  const self = p.id === me.userId;
                  return (
                    <tr key={p.id}>
                      <td>
                        {p.full_name}{self && <span className="muted"> (вы)</span>}
                        <div className="muted" style={{ fontSize: 12 }}>{emails.get(p.id)}{p.role && ' · есть прайс-доска'}</div>
                      </td>
                      <td>
                        {self ? <Badge tone="role">руководитель</Badge> : (
                          <form action={updateCanteenUser} className="cn-assign">
                            <input type="hidden" name="user_id" value={p.id} />
                            <select className="select" name="canteen_role" defaultValue={p.canteen_role ?? 'admin'} aria-label="Роль">
                              <option value="admin">Админ точки</option>
                              <option value="manager">Руководитель (все точки)</option>
                            </select>
                            <span className="cn-checks">
                              {cs.map((c) => (
                                <label key={c.id} className="tog"><input type="checkbox" name="canteen_id" value={c.id} defaultChecked={mine.has(c.id)} />{c.name}</label>
                              ))}
                            </span>
                            <button className="pb-btn pb-btn--sm" type="submit">Сохранить</button>
                          </form>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {!self && (
                          <details className="confirm">
                            <summary className="pb-btn pb-btn--quiet pb-btn--sm">Закрыть доступ</summary>
                            <form action={revokeCanteenUser}>
                              <input type="hidden" name="user_id" value={p.id} />
                              <button className="pb-btn pb-btn--sm" type="submit" style={{ color: 'var(--bad)' }}>Да, закрыть «Столовые»</button>
                            </form>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Админ видит только отмеченные точки: их закупки по ценам расходных и свои отчёты. Закупочные цены склада и прайс-доску он не видит.</p>
        </section>

        <AddCanteenUserForm canteens={cs} />

        <section className="card-box">
          <h2>Покупатели в 1С</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Расходная накладная на покупателя попадает в закупки точки, к которой он привязан.</p>
          {customers.length === 0 ? <p className="muted" style={{ margin: 0 }}>Расходных из 1С ещё нет.</p> : (
            <table className="team">
              <thead><tr><th>Покупатель в 1С</th><th>Точка</th></tr></thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}{!c.active && <span className="muted"> · без расходных за 90 дней</span>}</td>
                    <td>
                      <form action={linkCustomer} className="cn-assign">
                        <input type="hidden" name="customer_id" value={c.id} />
                        <select className="select" name="canteen_id" defaultValue={c.canteen} aria-label={`Точка для ${c.name}`}>
                          <option value="">— не точка —</option>
                          {cs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                        <button className="pb-btn pb-btn--sm" type="submit">OK</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}

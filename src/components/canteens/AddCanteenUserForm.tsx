'use client';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { addCanteenUser } from '@/app/canteens/actions';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="pb-btn pb-btn--primary" type="submit" disabled={pending}>{pending ? 'Добавляем…' : 'Добавить'}</button>;
}

export function AddCanteenUserForm({ canteens }: { canteens: { id: string; name: string }[] }) {
  const [state, action] = useFormState(addCanteenUser, null);
  const [role, setRole] = useState<'admin' | 'manager'>('admin');
  return (
    <form action={action} className="card-box">
      <h2>Добавить человека</h2>
      <div className="row-form">
        <div className="field"><label htmlFor="cu_name">Имя</label><input className="input" id="cu_name" name="full_name" required /></div>
        <div className="field"><label htmlFor="cu_email">Почта</label><input className="input" id="cu_email" name="email" type="email" required /></div>
        <div className="field"><label htmlFor="cu_pass">Временный пароль</label><input className="input" id="cu_pass" name="password" minLength={8} required /></div>
        <div className="field" style={{ flex: '0 1 220px' }}>
          <label htmlFor="cu_role">Роль</label>
          <select className="select" id="cu_role" name="canteen_role" value={role} onChange={(e) => setRole(e.target.value === 'manager' ? 'manager' : 'admin')}>
            <option value="admin">Админ точки</option>
            <option value="manager">Руководитель (все точки)</option>
          </select>
        </div>
      </div>
      {role === 'admin' && (
        <fieldset className="cn-checks cn-fieldset">
          <legend>Точки</legend>
          {canteens.map((c) => <label key={c.id} className="tog"><input type="checkbox" name="canteen_id" value={c.id} />{c.name}</label>)}
        </fieldset>
      )}
      <div><Submit /></div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Если у человека уже есть аккаунт в прайс-доске, укажите ту же почту — откроем ему «Центр Питания», пароль останется прежним.</p>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.ok && <p className="pb-trend--drop" role="status" style={{ margin: 0, fontSize: 13 }}>{state.ok}</p>}
    </form>
  );
}

'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { addMember } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="pb-btn pb-btn--primary" type="submit" disabled={pending}>{pending ? 'Добавляем…' : 'Добавить'}</button>;
}

export function AddMemberForm() {
  const [state, action] = useFormState(addMember, null);
  return (
    <form action={action} className="card-box">
      <h2>Добавить сотрудника</h2>
      <div className="row-form">
        <div className="field"><label htmlFor="full_name">Имя</label><input className="input" id="full_name" name="full_name" required /></div>
        <div className="field"><label htmlFor="email">Почта</label><input className="input" id="email" name="email" type="email" required /></div>
        <div className="field"><label htmlFor="password">Временный пароль</label><input className="input" id="password" name="password" minLength={8} required /></div>
        <div className="field" style={{ flex: '0 1 160px' }}>
          <label htmlFor="role">Роль</label>
          <select className="select" id="role" name="role" defaultValue="staff">
            <option value="staff">Сотрудник</option>
            <option value="manager">Руководитель</option>
          </select>
        </div>
        <Submit />
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Сотрудник видит цены, поставщиков и историю. Руководитель ещё видит переплаты, скрывает товары для всех и управляет командой.</p>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.ok && <p className="pb-trend--drop" role="status" style={{ margin: 0, fontSize: 13 }}>{state.ok}</p>}
    </form>
  );
}

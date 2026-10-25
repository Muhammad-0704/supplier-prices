'use client';
import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';

export function PasswordForm() {
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const p1 = String(f.get('p1') || ''), p2 = String(f.get('p2') || '');
    if (p1.length < 8) return setMsg({ error: 'Пароль должен быть не короче 8 символов.' });
    if (p1 !== p2) return setMsg({ error: 'Пароли не совпадают.' });
    setBusy(true);
    const { error } = await getBrowserClient().auth.updateUser({ password: p1 });
    setBusy(false);
    if (!error) form.reset();
    setMsg(error ? { error: `Не удалось сменить пароль: ${error.message}` } : { ok: 'Пароль изменён.' });
  }

  return (
    <form className="card-box" onSubmit={onSubmit}>
      <h2>Пароль</h2>
      <div className="row-form">
        <div className="field"><label htmlFor="p1">Новый пароль</label><input className="input" id="p1" name="p1" type="password" autoComplete="new-password" required minLength={8} /></div>
        <div className="field"><label htmlFor="p2">Ещё раз</label><input className="input" id="p2" name="p2" type="password" autoComplete="new-password" required /></div>
        <button className="pb-btn pb-btn--primary" type="submit" disabled={busy}>{busy ? 'Сохраняем…' : 'Сменить пароль'}</button>
      </div>
      {msg.error && <p className="err" role="alert" style={{ margin: 0 }}>{msg.error}</p>}
      {msg.ok && <p className="pb-trend--drop" role="status" style={{ margin: 0 }}>{msg.ok}</p>}
    </form>
  );
}

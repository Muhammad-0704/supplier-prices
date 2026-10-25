'use client';
import Link from 'next/link';
import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';

export default function AccountPage() {
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const p1 = String(f.get('p1') || ''), p2 = String(f.get('p2') || '');
    if (p1.length < 8) return setMsg({ error: 'Пароль должен быть не короче 8 символов.' });
    if (p1 !== p2) return setMsg({ error: 'Пароли не совпадают.' });
    setBusy(true);
    const { error } = await getBrowserClient().auth.updateUser({ password: p1 });
    setBusy(false);
    setMsg(error ? { error: `Не удалось сменить пароль: ${error.message}` } : { ok: 'Пароль изменён.' });
  }

  return (
    <main className="auth">
      <form className="auth__box" onSubmit={onSubmit}>
        <h1>Смена пароля</h1>
        <div className="field"><label htmlFor="p1">Новый пароль</label><input className="input" id="p1" name="p1" type="password" autoComplete="new-password" required /></div>
        <div className="field"><label htmlFor="p2">Ещё раз</label><input className="input" id="p2" name="p2" type="password" autoComplete="new-password" required /></div>
        {msg.error && <p className="err" role="alert">{msg.error}</p>}
        {msg.ok && <p className="pb-trend--drop" role="status" style={{ margin: 0 }}>{msg.ok}</p>}
        <button className="pb-btn pb-btn--primary" type="submit" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить пароль'}</button>
        <Link href="/" className="muted" style={{ fontSize: 13 }}>← К доске</Link>
      </form>
    </main>
  );
}

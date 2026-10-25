'use client';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveThresholds } from './actions';

function Save() {
  const { pending } = useFormStatus();
  return <button className="pb-btn pb-btn--sm" type="submit" disabled={pending}>{pending ? 'Сохраняем…' : 'Сохранить'}</button>;
}

/** Пороги сигналов о ценах и кнопка «Отправить сводку сейчас». */
export function AlertSettings({ up, down, connected }: { up: number; down: number; connected: boolean }) {
  const [state, action] = useFormState(saveThresholds, null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);

  async function sendNow() {
    setBusy(true);
    setMsg({});
    try {
      const res = await fetch('/api/weekly', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      setMsg(res.ok ? { ok: body.message } : { error: body.message || 'Не получилось отправить.' });
    } catch {
      setMsg({ error: 'Нет связи с сервером.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-box">
      <h2>Сигналы о ценах</h2>
      <p className="muted" style={{ margin: 0 }}>
        После каждой новой накладной из 1С бот пишет, если поставщик поднял цену или привёз заметно дешевле. По понедельникам в 9:00 приходит сводка за неделю.
      </p>
      <form action={action} className="row-form">
        <div className="field" style={{ flex: '0 1 220px' }}>
          <label htmlFor="up">Подорожало от, %</label>
          <input className="input num" id="up" name="up" inputMode="decimal" defaultValue={up} />
        </div>
        <div className="field" style={{ flex: '0 1 220px' }}>
          <label htmlFor="down">Привезли дешевле от, %</label>
          <input className="input num" id="down" name="down" inputMode="decimal" defaultValue={down} />
        </div>
        <Save />
      </form>
      {state?.ok && <p className="pb-trend--drop" style={{ margin: 0 }}>{state.ok}</p>}
      {state?.error && <p className="err" style={{ margin: 0 }}>{state.error}</p>}
      <div className="acts">
        <button type="button" className="pb-btn pb-btn--sm" onClick={sendNow} disabled={busy || !connected}>{busy ? 'Отправляем…' : 'Отправить сводку сейчас'}</button>
        {!connected && <span className="muted" style={{ fontSize: 12 }}>Сначала подключите чат Telegram</span>}
      </div>
      {msg.ok && <p className="pb-trend--drop" style={{ margin: 0 }}>{msg.ok}</p>}
      {msg.error && <p className="err" style={{ margin: 0 }}>{msg.error}</p>}
    </section>
  );
}

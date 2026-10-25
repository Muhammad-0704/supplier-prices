'use client';
import { useState } from 'react';

/** Утренний список «что заказать» в Telegram и проверочная отправка. */
export function OrderDigestCard({ connected }: { connected: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  async function sendNow() {
    setBusy(true);
    setMsg({});
    try {
      const res = await fetch('/api/order-digest', { method: 'POST' });
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
      <h2>Список заказа по утрам</h2>
      <p className="muted" style={{ margin: 0 }}>
        С понедельника по субботу в 8:20 бот присылает, что пора заказать и у кого дешевле. Если заказывать нечего, сообщения не будет.
      </p>
      <div className="acts">
        <button type="button" className="pb-btn pb-btn--sm" onClick={sendNow} disabled={busy || !connected}>{busy ? 'Отправляем…' : 'Отправить список сейчас'}</button>
        {!connected && <span className="muted" style={{ fontSize: 12 }}>Сначала подключите чат Telegram</span>}
      </div>
      {msg.ok && <p className="pb-trend--drop" style={{ margin: 0 }}>{msg.ok}</p>}
      {msg.error && <p className="err" style={{ margin: 0 }}>{msg.error}</p>}
    </section>
  );
}

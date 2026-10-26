'use client';
import { useState, useTransition } from 'react';
import { finishTelegramLink, startTelegramLink, unlinkTelegram } from '@/app/canteens/actions';

/** Привязка личного Telegram: напоминание в 21:00, если отчёт за день не сдан. */
export function TelegramLink({ linked }: { linked: boolean }) {
  const [link, setLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  if (linked) {
    return (
      <div className="cn-tg">
        <span className="muted">Напоминания в Telegram включены.</span>
        <button className="pb-btn pb-btn--quiet pb-btn--sm" type="button" disabled={pending} onClick={() => start(async () => { await unlinkTelegram(); })}>Отключить</button>
      </div>
    );
  }
  return (
    <div className="cn-tg">
      {!link ? (
        <>
          <span className="muted">Напомнить в Telegram в 21:00, если отчёт не сдан?</span>
          <button className="pb-btn pb-btn--sm" type="button" disabled={pending} onClick={() => start(async () => {
            const r = await startTelegramLink();
            if (r.link) { setLink(r.link); setMsg(null); window.open(r.link, '_blank', 'noopener'); } else setMsg(r);
          })}>Подключить Telegram</button>
        </>
      ) : (
        <>
          <span className="muted">Откройте <a href={link} target="_blank" rel="noopener noreferrer">бота</a>, нажмите «Старт», затем:</span>
          <button className="pb-btn pb-btn--primary pb-btn--sm" type="button" disabled={pending} onClick={() => start(async () => { setMsg(await finishTelegramLink()); })}>
            {pending ? 'Проверяем…' : 'Я нажал «Старт»'}
          </button>
        </>
      )}
      {msg?.error && <span className="err" role="alert">{msg.error}</span>}
      {msg?.ok && <span className="pb-trend--drop" role="status">{msg.ok}</span>}
    </div>
  );
}

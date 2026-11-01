'use client';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createTvLink, setTvLinkActive } from '@/app/canteens/actions';

export interface TvLinkRow { id: string; name: string; token: string; active: boolean; created_at: string; last_opened_at: string | null }

function Submit() {
  const { pending } = useFormStatus();
  return <button className="pb-btn pb-btn--primary pb-btn--sm" type="submit" disabled={pending}>{pending ? 'Создаём…' : 'Создать ссылку'}</button>;
}

function CopyLink({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="pb-btn pb-btn--sm"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch { window.prompt('Скопируйте ссылку', text); }
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? 'Скопировано' : 'Скопировать ссылку'}
    </button>
  );
}

/** Для уже существующих ссылок адрес собираем из текущего браузера; для только что созданной сервер уже дал готовый state.url. */
function siteOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function TvLinkForm({ links }: { links: TvLinkRow[] }) {
  const [state, action] = useFormState(createTvLink, null);
  return (
    <section className="card-box">
      <h2>ТВ в офисе</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Крупные цифры за сегодня по точкам, без входа — только по этой ссылке. Откройте её в браузере на ТВ. Выключить доступ можно в любой момент, не удаляя ссылку.
      </p>
      {links.length > 0 && (
        <table className="team">
          <thead><tr><th>Название</th><th>Ссылка</th><th /></tr></thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id}>
                <td>{l.name}{!l.active && <span className="muted"> · выключена</span>}</td>
                <td><CopyLink text={`${siteOrigin()}/tv/${l.token}`} /></td>
                <td style={{ textAlign: 'right' }}>
                  <form action={setTvLinkActive}>
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="active" value={String(!l.active)} />
                    <button className="pb-btn pb-btn--quiet pb-btn--sm" type="submit">{l.active ? 'Выключить' : 'Включить'}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form action={action} className="row-form">
        <div className="field" style={{ flex: '0 1 260px' }}>
          <label htmlFor="tv_name">Название (для себя)</label>
          <input className="input" id="tv_name" name="name" placeholder="Например, ТВ на складе" defaultValue={links.length ? '' : 'ТВ в офисе'} />
        </div>
        <div className="acts"><Submit /></div>
      </form>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.url && (
        <div className="notice" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <span>{state.ok}</span>
          <span className="link-url">{state.url}</span>
          <div><CopyLink text={state.url} /></div>
        </div>
      )}
    </section>
  );
}

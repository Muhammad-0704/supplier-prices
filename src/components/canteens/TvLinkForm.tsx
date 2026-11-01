'use client';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createTvLink, deleteTvLink, issueTvCode, setTvLinkActive } from '@/app/canteens/actions';

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

/** 6 цифр для входа на ТВ: открыть на ТВ адрес /tv и ввести код. Действует 10 минут. */
function PairCode({ id }: { id: string }) {
  const [state, action] = useFormState(issueTvCode, null);
  const { pending } = useFormStatus();
  return (
    <form action={action} className="tv-code">
      <input type="hidden" name="id" value={id} />
      {state?.code ? (
        <span className="tv-code__show" role="status">
          <b className="num">{state.code.slice(0, 3)} {state.code.slice(3)}</b>
          <span className="muted">до {state.until} · на ТВ откройте <b>{siteHost()}/tv</b></span>
        </span>
      ) : null}
      <button className="pb-btn pb-btn--sm" type="submit" disabled={pending}>{state?.code ? 'Новый код' : 'Код для ТВ'}</button>
      {state?.error && <span className="err">{state.error}</span>}
    </form>
  );
}

/** Удаление в два шага: «Удалить» → «Точно удалить?» */
function DeleteLink({ id, name }: { id: string; name: string }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" className="pb-btn pb-btn--quiet pb-btn--sm" onClick={() => setAsk(true)}>Удалить</button>;
  return (
    <form action={deleteTvLink} className="tv-del">
      <input type="hidden" name="id" value={id} />
      <span className="muted">Удалить «{name}»? Экран по ней перестанет работать.</span>
      <button className="pb-btn pb-btn--danger pb-btn--sm" type="submit">Удалить</button>
      <button type="button" className="pb-btn pb-btn--quiet pb-btn--sm" onClick={() => setAsk(false)}>Отмена</button>
    </form>
  );
}

function siteHost(): string {
  return typeof window !== 'undefined' ? window.location.host : '';
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
        Крупные цифры за сегодня по точкам, без входа на сайт. Проще всего: нажмите «Код для ТВ», на телевизоре откройте в браузере адрес <b>{siteHost() || 'сайт'}/tv</b> и введите 6 цифр. Можно и скопировать длинную ссылку. Выключить доступ можно в любой момент, удалить — насовсем.
      </p>
      {links.length > 0 && (
        <table className="team">
          <thead><tr><th>Название</th><th>Вход</th><th /></tr></thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id}>
                <td>{l.name}{!l.active && <span className="muted"> · выключена</span>}</td>
                <td>
                  <div className="tv-cell">
                    {l.active && <PairCode id={l.id} />}
                    <CopyLink text={`${siteOrigin()}/tv/${l.token}`} />
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div className="tv-cell tv-cell--end">
                    <form action={setTvLinkActive}>
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="active" value={String(!l.active)} />
                      <button className="pb-btn pb-btn--quiet pb-btn--sm" type="submit">{l.active ? 'Выключить' : 'Включить'}</button>
                    </form>
                    <DeleteLink id={l.id} name={l.name} />
                  </div>
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

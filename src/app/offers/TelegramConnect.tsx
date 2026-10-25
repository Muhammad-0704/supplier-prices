'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { connectTelegramAction } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="pb-btn pb-btn--sm" type="submit" disabled={pending}>{pending ? 'Проверяем…' : 'Подключить чат'}</button>;
}

export function TelegramConnect({ configured, connected }: { configured: boolean; connected: boolean }) {
  const [state, action] = useFormState(connectTelegramAction, null);
  return (
    <section className="card-box">
      <h2>Уведомления в Telegram</h2>
      {!configured ? (
        <ol className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: '22px' }}>
          <li>В Telegram откройте <b>@BotFather</b>, отправьте <code>/newbot</code>, придумайте имя. Он пришлёт токен.</li>
          <li>Добавьте токен в Vercel: Settings → Environment Variables, имя <code>TELEGRAM_BOT_TOKEN</code>, тип Sensitive. Потом Redeploy.</li>
          <li>Откройте своего бота и нажмите «Старт». Вернитесь сюда и нажмите «Подключить чат».</li>
        </ol>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          {connected ? 'Чат подключён: новые предложения приходят в Telegram. Чтобы сменить чат, напишите боту в новом чате и нажмите кнопку ещё раз.' : 'Бот настроен. Откройте его в Telegram, нажмите «Старт», затем «Подключить чат».'}
        </p>
      )}
      {configured && <form action={action}><Submit /></form>}
      {state?.ok && <p className="pb-trend--drop" style={{ margin: 0 }}>{state.ok}</p>}
      {state?.error && <p className="err" style={{ margin: 0 }}>{state.error}</p>}
    </section>
  );
}

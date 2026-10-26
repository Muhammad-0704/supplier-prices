'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { BazaLogo } from '@/components/Logos';
import { signIn } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="pb-btn pb-btn--primary" type="submit" disabled={pending} style={{ width: '100%' }}>
      {pending ? 'Входим…' : 'Войти'}
    </button>
  );
}

export default function LoginPage() {
  const [state, action] = useFormState(signIn, null);
  return (
    <main className="auth">
      <form className="auth__box" action={action}>
        <div className="brand">
          <BazaLogo size={36} />
          <div>
            <h1>База</h1>
            <div className="brand__sub">Прайс-доска и Центр Питания</div>
          </div>
        </div>
        <div className="field">
          <label htmlFor="email">Почта</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Пароль</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state?.error && <p className="err" role="alert">{state.error}</p>}
        <Submit />
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>Аккаунт выдаёт руководитель. Забыли пароль — попросите его прислать приглашение заново.</p>
      </form>
    </main>
  );
}

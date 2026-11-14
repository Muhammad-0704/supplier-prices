'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { BazaLogo } from '@/components/Logos';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { signIn } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button className="auth__submit" type="submit" disabled={pending}>
      {pending ? 'Входим…' : 'Войти'}
    </Button>
  );
}

export default function LoginPage() {
  const [state, action] = useFormState(signIn, null);
  return (
    <main className="auth">
      <div className="auth__masthead"><span><BazaLogo size={30} />База</span><ThemeToggle /></div>
      <form className="auth__box" action={action} aria-labelledby="login-title">
        <header className="auth__heading">
          <h1 id="login-title">Вход в Базу</h1>
          <p>Прайс-доска и Центр Питания</p>
        </header>
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
        <p className="auth__help">Аккаунт выдаёт руководитель. Забыли пароль — попросите его прислать приглашение заново.</p>
      </form>
    </main>
  );
}

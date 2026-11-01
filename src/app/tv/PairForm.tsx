'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { pairTv } from './actions';
import styles from './pair.module.css';

function Submit() {
  const { pending } = useFormStatus();
  return <button className={styles.btn} type="submit" disabled={pending}>{pending ? 'Открываем…' : 'Открыть экран'}</button>;
}

export function PairForm() {
  const [state, action] = useFormState(pairTv, null);
  return (
    <form action={action} className={styles.form}>
      <label htmlFor="code" className={styles.srOnly}>Код из 6 цифр</label>
      <input
        id="code" name="code" className={styles.code}
        inputMode="numeric" pattern="[0-9 ]*" maxLength={7} autoComplete="off" autoFocus
        placeholder="000000" aria-describedby={state?.error ? 'code-err' : undefined}
      />
      <Submit />
      {state?.error && <p id="code-err" className={styles.err} role="alert">{state.error}</p>}
    </form>
  );
}

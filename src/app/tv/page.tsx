import type { Metadata } from 'next';
import { PairForm } from './PairForm';
import styles from './pair.module.css';

export const metadata: Metadata = { title: 'Экран точек — вход', robots: { index: false, follow: false } };

/** Короткий вход на ТВ: вместо длинной ссылки — 6 цифр из «Центр Питания» → «Доступы» → «Код для ТВ». */
export default function TvPairPage() {
  return (
    <main className={styles.screen}>
      <div className={styles.box}>
        <h1 className={styles.title}>Экран точек</h1>
        <p className={styles.lead}>Введите 6 цифр из «Центр Питания» → «Доступы» → «Код для ТВ».</p>
        <PairForm />
        <p className={styles.hint}>После входа добавьте страницу в закладки браузера — в следующий раз код не понадобится.</p>
      </div>
    </main>
  );
}

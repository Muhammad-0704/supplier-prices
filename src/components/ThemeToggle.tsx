'use client';
import { useEffect, useState } from 'react';

/** Переключатель темы. По умолчанию светлая; выбор запоминается на устройстве. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark');
  }, []);

  function toggle() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('pb_theme', next); } catch { /* приватный режим */ }
    setDark(!dark);
  }

  return (
    <button type="button" className="pb-btn pb-btn--quiet pb-btn--sm theme-toggle" onClick={toggle} aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'} title={dark ? 'Светлая тема' : 'Тёмная тема'}>
      {dark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}

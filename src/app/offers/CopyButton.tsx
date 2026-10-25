'use client';
import { useState } from 'react';

export function CopyButton({ text, label = 'Скопировать ссылку' }: { text: string; label?: string }) {
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
      {done ? 'Скопировано' : label}
    </button>
  );
}

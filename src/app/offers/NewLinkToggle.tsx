'use client';
import { useState, type ReactNode } from 'react';

/** Форма новой ссылки открывается по кнопке, чтобы список ссылок был на виду. */
export function NewLinkToggle({ defaultOpen, children }: { defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!open) {
    return (
      <div>
        <button type="button" className="pb-btn pb-btn--primary" onClick={() => setOpen(true)}>+ Новая ссылка</button>
      </div>
    );
  }
  return (
    <div className="new-link">
      {children}
      {!defaultOpen && <button type="button" className="pb-btn pb-btn--quiet pb-btn--sm new-link__close" onClick={() => setOpen(false)}>Свернуть</button>}
    </div>
  );
}

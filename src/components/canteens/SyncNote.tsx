'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { syncLabel } from '@/lib/format';
import { SyncStatus } from '../ui';

/** «По данным 1С на …» и кнопка обновить. Свежие цифры дня точны настолько, насколько вовремя внесены расходные в 1С. */
export function SyncNote({ at, ok, message }: { at: string | null; ok: boolean; message: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) setNote(body.message || 'Не удалось получить данные из 1С');
      else if (body.shipments && !body.shipments.ok) setNote(body.shipments.message);
      else setNote(body.shipments?.message ?? body.message ?? 'Обновлено');
      router.refresh();
    } catch {
      setNote('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cn-sync">
      <SyncStatus state={busy ? 'syncing' : ok ? 'ok' : 'error'} label={busy ? 'Получаем данные из 1С…' : at ? syncLabel(at).replace('Синхронизировано с 1С', 'Данные 1С') : 'Расходных из 1С ещё нет'} />
      <button className="pb-btn pb-btn--quiet pb-btn--sm" type="button" onClick={refresh} disabled={busy}>Обновить</button>
      {!ok && message && !note && <span className="err">{message}</span>}
      {note && <span className="muted" role="status">{note}</span>}
    </div>
  );
}

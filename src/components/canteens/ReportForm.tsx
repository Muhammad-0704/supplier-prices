'use client';
import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveReport } from '@/app/canteens/actions';

function Submit({ edit }: { edit: boolean }) {
  const { pending } = useFormStatus();
  return <button className="pb-btn pb-btn--primary" type="submit" disabled={pending}>{pending ? 'Сохраняем…' : edit ? 'Исправить' : 'Сдать отчёт'}</button>;
}

export interface ReportValue { cash: number; card: number }

/** Отчёт за день: дата, наличные, безнал (сверяют с чеками из отчёта кассы). Подставляет уже сданные цифры. */
export function ReportForm({ canteenId, today, minDay, reports }: { canteenId: string; today: string; minDay: string | null; reports: Record<string, ReportValue> }) {
  const [state, action] = useFormState(saveReport, null);
  const [day, setDay] = useState(today);
  const cur = reports[day];
  const [cash, setCash] = useState(cur ? String(cur.cash) : '');
  const [card, setCard] = useState(cur ? String(cur.card) : '');

  useEffect(() => {
    const r = reports[day];
    setCash(r ? String(r.cash) : '');
    setCard(r ? String(r.card) : '');
  }, [day, reports]);

  const total = (Number(cash.replace(/\s/g, '').replace(',', '.')) || 0) + (Number(card.replace(/\s/g, '').replace(',', '.')) || 0);

  return (
    <form action={action} className="card-box cn-report">
      <div className="cn-head">
        <h2>Отчёт за день</h2>
        {cur && <span className="pb-badge pb-badge--best">сдан</span>}
      </div>
      <input type="hidden" name="canteen_id" value={canteenId} />
      <div className="row-form">
        <div className="field" style={{ flex: '0 1 170px' }}>
          <label htmlFor="report_date">Дата</label>
          <input className="input" id="report_date" name="report_date" type="date" value={day} max={today} min={minDay ?? undefined} onChange={(e) => setDay(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="cash">Наличные, ₽</label>
          <input className="input num" id="cash" name="cash" inputMode="decimal" autoComplete="off" placeholder="0" value={cash} onChange={(e) => setCash(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="card">Безнал, ₽</label>
          <input className="input num" id="card" name="card" inputMode="decimal" autoComplete="off" placeholder="0" value={card} onChange={(e) => setCard(e.target.value)} />
        </div>
        <Submit edit={!!cur} />
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Выручка за день: <b className="num">{new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(total)} ₽</b>. Безнал сверьте с отчётом кассы.
        {minDay && ' Исправить можно отчёт за сегодня и вчера.'}
      </p>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.ok && <p className="pb-trend--drop" role="status" style={{ margin: 0, fontSize: 13 }}>{state.ok}</p>}
    </form>
  );
}

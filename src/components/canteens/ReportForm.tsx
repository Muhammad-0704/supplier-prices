'use client';
import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveReport } from '@/app/canteens/actions';

export interface ReportValue { cash: number; card: number; meat: number }

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const parse = (v: string) => Number(v.replace(/[\s ]/g, '').replace(',', '.')) || 0;
const ddmm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="pb-btn pb-btn--primary rf__submit" type="submit" disabled={pending}>{pending ? 'Сохраняем…' : label}</button>;
}

function Money({ id, label, hint, value, onChange }: { id: string; label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="rf__field">
      <label htmlFor={id}>{label}</label>
      <span className="rf__input">
        <input id={id} name={id} inputMode="decimal" autoComplete="off" placeholder="0" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}_hint` : undefined} />
        <span aria-hidden="true">₽</span>
      </span>
      {hint && <span className="rf__hint" id={`${id}_hint`}>{hint}</span>}
    </div>
  );
}

/**
 * Отчёт за день — главное действие админа точки, рассчитано на телефон.
 * Админ выбирает «Сегодня» или «Вчера» (раньше — только через руководителя), руководитель — любой день.
 */
export function ReportForm({ canteenId, today, yesterday, manager, reports }: { canteenId: string; today: string; yesterday: string; manager: boolean; reports: Record<string, ReportValue> }) {
  const [state, action] = useFormState(saveReport, null);
  const [day, setDay] = useState(today);
  const cur = reports[day];
  const [cash, setCash] = useState(cur ? String(cur.cash) : '');
  const [card, setCard] = useState(cur ? String(cur.card) : '');
  const [meat, setMeat] = useState(cur?.meat ? String(cur.meat) : '');

  useEffect(() => {
    const r = reports[day];
    setCash(r ? String(r.cash) : '');
    setCard(r ? String(r.card) : '');
    setMeat(r?.meat ? String(r.meat) : '');
  }, [day, reports]);

  const revenue = parse(cash) + parse(card);
  const dayName = day === today ? 'сегодня' : day === yesterday ? 'вчера' : ddmm(day);
  const other = day !== today && day !== yesterday;

  return (
    <form action={action} className={`rf ${cur ? 'rf--done' : ''}`}>
      <input type="hidden" name="canteen_id" value={canteenId} />
      <input type="hidden" name="report_date" value={day} />

      <div className="rf__head">
        <h2>Отчёт за день</h2>
        <div className="rf__days" role="group" aria-label="День отчёта">
          <button type="button" aria-pressed={day === today} onClick={() => setDay(today)}>Сегодня <span>{ddmm(today)}</span></button>
          <button type="button" aria-pressed={day === yesterday} onClick={() => setDay(yesterday)}>Вчера <span>{ddmm(yesterday)}</span></button>
          {manager && (
            <label className={`rf__other ${other ? 'is-on' : ''}`}>
              <span className="sr-only">Другой день</span>
              <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
            </label>
          )}
        </div>
        <span className={`dot ${cur ? 'dot--ok' : 'dot--miss'}`}>{cur ? `за ${dayName} сдан — можно исправить` : `за ${dayName} ещё не сдан`}</span>
      </div>

      <div className="rf__fields">
        <Money id="cash" label="Наличные" value={cash} onChange={setCash} />
        <Money id="card" label="Безнал" hint="сверьте с отчётом кассы" value={card} onChange={setCard} />
        <Money id="meat" label="Мясо" hint="сумма по накладным, как в тетради" value={meat} onChange={setMeat} />
      </div>

      <div className="rf__foot">
        <span className="rf__total">Выручка за {dayName}: <b className="num">{nf.format(revenue)} ₽</b></span>
        <Submit label={cur ? 'Сохранить исправления' : `Сдать отчёт за ${dayName}`} />
      </div>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.ok && <p className="rf__ok" role="status">{state.ok}</p>}
    </form>
  );
}

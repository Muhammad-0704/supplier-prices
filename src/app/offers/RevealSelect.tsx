'use client';
import { REVEAL_OPTIONS, type Reveal } from '@/lib/reveal';
import { setLinkReveal } from './actions';

/** Что видит поставщик по этой ссылке: меняется сразу при выборе. */
export function RevealSelect({ id, value }: { id: string; value: Reveal }) {
  return (
    <form action={setLinkReveal}>
      <input type="hidden" name="id" value={id} />
      <select className="select reveal-select" name="reveal" defaultValue={value} aria-label="Что видит поставщик"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {REVEAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>Видит: {o.title.toLowerCase()}</option>)}
      </select>
    </form>
  );
}

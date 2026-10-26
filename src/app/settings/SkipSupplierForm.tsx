'use client';
import { useState } from 'react';
import { Picker } from '@/components/Picker';
import { setSkipRequest } from './request-actions';

/** Выбрать поставщика и убрать его из заявки, с пояснением почему. */
export function SkipSupplierForm({ suppliers }: { suppliers: { id: string; name: string; docs: number }[] }) {
  const [id, setId] = useState('all');
  return (
    <form action={setSkipRequest} className="row-form" onSubmit={() => setTimeout(() => setId('all'), 0)}>
      <input type="hidden" name="supplier_id" value={id === 'all' ? '' : id} />
      <input type="hidden" name="skip" value="true" />
      <div className="field" style={{ flex: '0 1 280px' }}>
        <label>Поставщик</label>
        <Picker label="Поставщик" allLabel="Выберите поставщика" searchPlaceholder="Найти поставщика" value={id} onChange={setId}
          options={suppliers.map((s) => ({ value: s.id, label: s.name, count: s.docs }))} />
      </div>
      <div className="field">
        <label htmlFor="skip-note">Почему (для команды)</label>
        <input className="input" id="skip-note" name="note" placeholder="Например: берём ежедневно по заявкам столовых" />
      </div>
      <button className="pb-btn pb-btn--primary" type="submit" disabled={id === 'all'}>Убрать из заявки</button>
    </form>
  );
}

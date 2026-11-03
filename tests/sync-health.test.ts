import { describe, expect, it } from 'vitest';
import { healthAlerts, type HealthKey, type HealthState } from '../src/lib/sync-health';

const m = (e: [HealthKey, HealthState][]) => new Map(e);

describe('healthAlerts', () => {
  it('молчит, пока состояние не меняется', () => {
    expect(healthAlerts(m([['shipments', { ok: true, message: 'a' }]]), m([['shipments', { ok: true, message: 'b' }]]), null)).toEqual([]);
    expect(healthAlerts(m([['iiko', { ok: false, message: 'x' }]]), m([['iiko', { ok: false, message: 'x' }]]), null)).toEqual([]);
  });
  it('пишет о сбое и о восстановлении', () => {
    const [fail] = healthAlerts(m([['iiko', { ok: true, message: null }]]), m([['iiko', { ok: false, message: 'Петрашка — 401 <x>' }]]), 'https://s');
    expect(fail).toContain('Выручка из iiko: загрузка не прошла');
    expect(fail).toContain('&lt;x&gt;');
    const [back] = healthAlerts(m([['shipments', { ok: false, message: 'e' }]]), m([['shipments', { ok: true, message: 'Расходных: 3' }]]), null);
    expect(back).toContain('снова загружаются');
  });
  it('первая ошибка без прошлого состояния — тоже сбой', () => {
    expect(healthAlerts(new Map(), m([['iiko', { ok: false, message: 'нет входа' }]]), null)).toHaveLength(1);
  });
});

import 'server-only';
import { SITE_URL } from './alert-runner';
import { longDate, plural } from './format';
import type { OrderRow } from './reorder-data';
import { fmtQty } from './reorder-text';
import { esc } from './telegram';

const MAX_LINES = 40;

/** Утренний список «пора заказать» по поставщикам с лучшей ценой. */
export function buildDigest(rows: OrderRow[], suppliers: Record<string, string>, now = Date.now()): string | null {
  const open = rows.filter((r) => !r.s.ordered && r.s.orderQty > 0);
  const due = open.filter((r) => r.s.status === 'due' || r.s.status === 'soon');
  const check = open.filter((r) => r.s.status === 'check');
  if (!due.some((r) => r.s.status === 'due') && !check.length) return null;
  const by = new Map<string, OrderRow[]>();
  for (const r of due) by.set(r.bestSupplierId, [...(by.get(r.bestSupplierId) ?? []), r]);
  const nDue = due.filter((r) => r.s.status === 'due').length;
  const out = [`<b>Заявка на ${longDate(new Date(now).toISOString())}</b>`, `Пора: ${nDue}, скоро: ${due.length - nDue}. Дешевле всего сейчас:`];
  let lines = 0;
  for (const [sup, list] of [...by.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (lines >= MAX_LINES) break;
    out.push('', `<b>${esc(suppliers[sup] ?? 'Поставщик')}</b>`);
    for (const r of list.sort((a, b) => (a.s.status === 'due' ? 0 : 1) - (b.s.status === 'due' ? 0 : 1))) {
      if (lines++ >= MAX_LINES) break;
      const mark = r.s.status === 'due' ? '•' : '◦';
      const why = r.s.basis === 'count' ? 'по пересчёту' : `обычно раз в ${Math.round(r.s.rhythm.intervalDays)} дн., прошло ${r.s.rhythm.daysSince}`;
      out.push(`${mark} ${esc(r.name)} — ${fmtQty(r.s.orderQty)} ${esc(r.unit)} <i>(${why})</i>`);
    }
  }
  if (due.length > MAX_LINES) out.push('', `…и ещё ${due.length - MAX_LINES} ${plural(due.length - MAX_LINES, 'позиция', 'позиции', 'позиций')}`);
  if (check.length) {
    const names = check.slice(0, 15).map((r) => esc(r.name)).join(', ');
    out.push('', `<b>Проверьте на складе</b> (не брали дольше обычного): ${names}${check.length > 15 ? ` и ещё ${check.length - 15}` : ''}`);
  }
  out.push('', `Проверить остатки и отметить заказы: ${SITE_URL}/order`);
  return out.join('\n');
}

/** Telegram для «Столовых»: напоминание админам, кто не сдал отчёт, и утренняя сводка руководителю. */
import { dayTitle, reportMismatch, type CanteenTotals } from './canteens';

const n0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const money = (v: number) => `${n0.format(Math.round(v))} ₽`;
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Ключи в app_settings: личный чат и код привязки пользователя */
export const chatKey = (userId: string) => `tg_chat:${userId}`;
export const codeKey = (userId: string) => `tg_code:${userId}`;

export function reminderText(canteenNames: string[], day: string, siteUrl: string | null): string {
  const list = canteenNames.map((c) => `«${esc(c)}»`).join(', ');
  const link = siteUrl ? `\n<a href="${siteUrl}/canteens">Сдать отчёт</a>` : '';
  return `Напоминание: отчёт за ${dayTitle(day)} по ${canteenNames.length > 1 ? 'точкам' : 'точке'} ${list} ещё не сдан. Наличные и безнал — 2 минуты.${link}`;
}

/**
 * Сводка руководителю за день: по каждой точке выручка, отгружено со склада, фудкост; кто не сдал отчёт.
 * Внизу — итог месяца на сегодня.
 */
export function summaryText(
  day: string,
  canteens: { id: string; name: string }[],
  totals: Map<string, CanteenTotals>,
  siteUrl: string | null,
): string {
  const lines: string[] = [`<b>Столовые за ${dayTitle(day)}</b>`];
  let rev = 0, ship = 0, meat = 0, mRev = 0, mBuy = 0;
  const missing: string[] = [];
  for (const c of canteens) {
    const t = totals.get(c.id);
    const d = t?.byDay.get(day);
    const shipped = d?.shipped ?? 0;
    ship += shipped;
    if (t) { mRev += t.revenue; mBuy += t.shipped + t.meat; }
    if (!d?.reported) missing.push(c.name);
    if (!d?.hasRevenue) {
      lines.push(`${esc(c.name)}: отчёта нет · склад ${money(shipped)}`);
      continue;
    }
    rev += d.revenue;
    meat += d.meat;
    const src = d.source === 'iiko' ? ' iiko' : '';
    const meatPart = d.meat ? ` · мясо ${money(d.meat)}` : d.reported ? '' : ' · мясо неизвестно (нет отчёта)';
    const diff = reportMismatch(d);
    const diffPart = diff != null ? ` · ⚠ в отчёте админа ${diff > 0 ? 'больше' : 'меньше'} на ${money(Math.abs(diff))}` : '';
    lines.push(`${esc(c.name)}: выручка${src} ${money(d.revenue)} (нал ${money(d.cash)}, безнал ${money(d.card)}) · склад ${money(shipped)}${meatPart} · фудкост ${pct(d.revenue > 0 ? (shipped + d.meat) / d.revenue : null)}${diffPart}`);
  }
  lines.push('');
  lines.push(`<b>Всего:</b> выручка ${money(rev)} · склад ${money(ship)} · мясо ${money(meat)}`);
  if (missing.length) lines.push(`Не сдали отчёт: ${missing.map(esc).join(', ')}`);
  lines.push(`С начала месяца: выручка ${money(mRev)} · закупки ${money(mBuy)} · фудкост ${pct(mRev > 0 ? mBuy / mRev : null)}`);
  if (siteUrl) lines.push(`<a href="${siteUrl}/canteens">Открыть «Столовые»</a>`);
  return lines.join('\n');
}

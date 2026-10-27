/** Telegram для «Центра Питания»: напоминание админам, кто не сдал отчёт, и утренняя сводка руководителю. */
import { dayTitle } from './canteens';
import { fcText, totalView, type PointView } from './canteens-view';

const n0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const money = (v: number) => `${n0.format(Math.round(v))} ₽`;
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
 * Сводка руководителю за день: по каждой точке выручка, склад (по закупочным, если известны), мясо, фудкост;
 * кто не сдал отчёт. Внизу — месяц на сегодня, фудкост за дни с выручкой.
 */
export function summaryText(day: string, points: PointView[], siteUrl: string | null): string {
  const lines: string[] = [`<b>Центр Питания за ${dayTitle(day)}</b>`];
  let rev = 0, buy = 0, meat = 0;
  const missing: string[] = [];
  for (const p of points) {
    const d = p.byDay.get(day);
    buy += d?.buy ?? 0;
    if (!d?.reported) missing.push(p.name);
    if (!d?.hasRevenue) {
      lines.push(`${esc(p.name)}: отчёта нет · склад ${money(d?.buy ?? 0)}`);
      continue;
    }
    rev += d.revenue;
    meat += d.meat;
    const src = d.source === 'iiko' ? ' iiko' : '';
    const meatPart = d.meat ? ` · мясо ${money(d.meat)}` : d.reported ? '' : ' · мясо неизвестно (нет отчёта)';
    const diffPart = d.mismatch != null ? ` · ⚠ в отчёте админа ${d.mismatch > 0 ? 'больше' : 'меньше'} на ${money(Math.abs(d.mismatch))}` : '';
    const checksPart = d.source === 'iiko' && d.checks > 0 ? `, чеков ${d.checks}, ср. чек ${money(d.revenue / d.checks)}` : '';
    lines.push(`${esc(p.name)}: выручка${src} ${money(d.revenue)} (нал ${money(d.cash)}, безнал ${money(d.card)}${checksPart}) · склад ${money(d.buy)}${meatPart} · фудкост ${fcText(d.revenue > 0 ? (d.buy + d.meat) / d.revenue : null)}${diffPart}`);
  }
  const month = totalView(points);
  lines.push('');
  lines.push(`<b>Всего:</b> выручка ${money(rev)} · склад ${money(buy)} · мясо ${money(meat)}`);
  if (missing.length) lines.push(`Не сдали отчёт: ${missing.map(esc).join(', ')}`);
  lines.push(`С начала месяца: выручка ${money(month.revenue)} · закупки ${money(month.buy + month.meat)} · фудкост ${fcText(month.foodcost)}`);
  if (siteUrl) lines.push(`<a href="${siteUrl}/canteens">Открыть «Центр Питания»</a>`);
  return lines.join('\n');
}

/** Предупреждение руководителю, когда загрузка из 1С или iiko ломается и когда снова заработала. Только на смене состояния — без спама каждые 10 минут. */

export type HealthKey = 'shipments' | 'iiko';
export interface HealthState { ok: boolean; message: string | null }

const LABEL: Record<HealthKey, string> = { shipments: 'Расходные из 1С', iiko: 'Выручка из iiko' };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function healthAlerts(before: Map<HealthKey, HealthState>, after: Map<HealthKey, HealthState>, siteUrl: string | null): string[] {
  const out: string[] = [];
  for (const [key, now] of after) {
    const was = before.get(key);
    const wasOk = was ? was.ok : true;
    if (wasOk === now.ok) continue;
    const link = siteUrl ? `\n<a href="${siteUrl}/canteens">Открыть «Центр Питания»</a>` : '';
    out.push(now.ok
      ? `✅ ${LABEL[key]}: снова загружаются.${now.message ? ` ${esc(now.message)}` : ''}`
      : `⚠️ ${LABEL[key]}: загрузка не прошла.\n${esc(now.message ?? 'без подробностей')}\nЦифры на сайте могут быть неполными, пока ошибка не уйдёт.${link}`);
  }
  return out;
}

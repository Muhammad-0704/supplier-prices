import 'server-only';
import { createHash } from 'node:crypto';
import { chooseSalesFields, parseSales, salesRequest, type DayRevenue, type OlapColumns } from './olap';

/**
 * iikoServer API (сервер точки, например kafe-levyi-bereg.iiko.it). Вход по логину и SHA-1 пароля.
 * Каждый вход занимает лицензионное место, поэтому после запросов всегда выходим.
 */
export class IikoError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

const sha1 = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex');

async function req(url: string, init?: RequestInit, timeoutMs = 30_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
  } catch (e) {
    throw new IikoError(`Сервер iiko не ответил: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}

export async function withIiko<T>(host: string, login: string, password: string, fn: (call: (path: string, init?: RequestInit) => Promise<unknown>) => Promise<T>): Promise<T> {
  const base = `https://${host.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/resto/api`;
  const auth = await req(`${base}/auth?login=${encodeURIComponent(login)}&pass=${sha1(password)}`);
  const token = (await auth.text()).trim();
  if (!auth.ok) {
    if (auth.status === 401 || auth.status === 403) throw new IikoError(`iiko ${host}: неверный логин или пароль`, auth.status);
    if (/licen|лиценз/i.test(token)) throw new IikoError(`iiko ${host}: нет свободной лицензии для входа, попробуем позже`, auth.status);
    throw new IikoError(`iiko ${host}: вход не удался (${auth.status}) ${token.slice(0, 200)}`, auth.status);
  }
  const call = async (path: string, init?: RequestInit) => {
    const sep = path.includes('?') ? '&' : '?';
    const res = await req(`${base}${path}${sep}key=${encodeURIComponent(token)}`, init);
    const text = await res.text();
    if (!res.ok) throw new IikoError(`iiko ${host}: ${path.split('?')[0]} → ${res.status} ${text.slice(0, 300)}`, res.status);
    try { return JSON.parse(text); } catch { return text; }
  };
  try {
    return await fn(call);
  } finally {
    // Освобождаем лицензию в любом случае
    await req(`${base}/logout?key=${encodeURIComponent(token)}`, undefined, 10_000).catch(() => undefined);
  }
}

/** Выручка по дням с from по to (to не включая): наличные, безнал, по типам оплат, чеки. */
export async function fetchRevenue(host: string, login: string, password: string, from: string, to: string): Promise<DayRevenue[]> {
  return withIiko(host, login, password, async (call) => {
    const cols = (await call('/v2/reports/olap/columns?reportType=SALES')) as OlapColumns;
    const fields = chooseSalesFields(cols);
    if (!fields) throw new IikoError(`iiko ${host}: в отчёте по продажам нет нужных полей (дата, тип оплаты, сумма)`);
    const post = (body: unknown) => call('/v2/reports/olap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as Promise<{ data?: Record<string, unknown>[] }>;
    const sales = await post(salesRequest(fields, from, to, true));
    const checks = fields.orders ? await post(salesRequest(fields, from, to, false)) : { data: [] };
    return parseSales(fields, sales.data ?? [], checks.data ?? []);
  });
}

import { ONEC } from './config';

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface ODataRow {
  [key: string]: unknown;
}

export interface ODataClientOptions {
  baseUrl: string;
  user: string;
  password: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

export class ODataError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

/** Basic-авторизация с логином и паролем в UTF-8: у служебных пользователей 1С бывают русские логины. */
export function basicAuth(user: string, password: string): string {
  return 'Basic ' + Buffer.from(`${user}:${password}`, 'utf8').toString('base64');
}

/** Дата для $filter в формате OData 1С: datetime'2026-05-01T00:00:00' */
export function odataDate(d: Date): string {
  return `datetime'${d.toISOString().slice(0, 19)}'`;
}

export function buildUrl(baseUrl: string, entity: string, params: Record<string, string | number | undefined>): string {
  const base = baseUrl.replace(/\/+$/, '');
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${base}/${encodeURIComponent(entity)}?${qs}`;
}

export function createODataClient(opts: ODataClientOptions) {
  const fetcher: Fetcher = opts.fetcher ?? ((u, i) => fetch(u, i));
  const auth = basicAuth(opts.user, opts.password);

  const entityOf = (url: string) => decodeURIComponent(new URL(url).pathname.split('/').pop() || '');

  async function once(url: string): Promise<ODataRow[]> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90_000);
    try {
      const res = await fetcher(url, { headers: { Authorization: auth, Accept: 'application/json' }, signal: ctrl.signal, cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        throw new ODataError('1С:Фреш отклонил логин или пароль служебного пользователя OData. Проверьте ONEC_USER и ONEC_PASSWORD.', res.status);
      }
      if (res.status === 404) {
        throw new ODataError(`Объект ${entityOf(url)} не найден в OData. Проверьте, что он отмечен в настройке стандартного интерфейса OData в 1С.`, 404);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ODataError(`1С вернула ошибку ${res.status} на ${entityOf(url)}: ${text.slice(0, 300)}`, res.status);
      }
      const body = (await res.json()) as { value?: ODataRow[] };
      return body.value ?? [];
    } finally {
      clearTimeout(timer);
    }
  }

  /** Один запрос с повтором: 1С:Фреш иногда обрывает долгие ответы. Ошибки доступа не повторяются. */
  async function get(url: string): Promise<ODataRow[]> {
    const started = Date.now();
    for (let attempt = 1; ; attempt++) {
      try {
        const rows = await once(url);
        if (!opts.fetcher) console.log(`[odata] ${entityOf(url)} skip=${new URL(url).searchParams.get('$skip')} → ${rows.length} за ${((Date.now() - started) / 1000).toFixed(1)}с`);
        return rows;
      } catch (e) {
        if (e instanceof ODataError && e.status) throw e;
        if (!opts.fetcher) console.log(`[odata] ${entityOf(url)} попытка ${attempt} оборвалась: ${(e as Error).message}`);
        if (attempt >= 3) throw new ODataError(`1С:Фреш не отдал ${entityOf(url)} за 3 попытки (${(e as Error).message}).`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }

  /** Читает всю выборку постранично ($top/$skip). */
  async function list(entity: string, params: { filter?: string; select?: string[]; pageSize?: number } = {}): Promise<ODataRow[]> {
    const size = params.pageSize ?? ONEC.pageSize;
    const out: ODataRow[] = [];
    for (let skip = 0; ; skip += size) {
      const url = buildUrl(opts.baseUrl, entity, {
        $format: 'json',
        $filter: params.filter,
        $select: params.select?.join(','),
        $top: size,
        $skip: skip,
        $orderby: 'Ref_Key',
      });
      const page = await get(url);
      out.push(...page);
      if (page.length < size) break;
    }
    return out;
  }

  return { list, get };
}

export type ODataClient = ReturnType<typeof createODataClient>;

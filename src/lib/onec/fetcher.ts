import 'server-only';
import https from 'node:https';
import { Readable } from 'node:stream';
import type { Fetcher } from './odata';

/**
 * Запросы к 1С:Фреш, каждый по новому соединению.
 * Соединение между зарубежным сервером и 1С:Фреш «замерзает», когда через него прошло примерно 30 КБ,
 * поэтому повторно использовать соединения (keep-alive, как делает обычный fetch) нельзя.
 */
const agent = new https.Agent({ keepAlive: false, maxSockets: 4 });

export const freshConnectionFetcher: Fetcher = (url, init) =>
  new Promise((resolve, reject) => {
    const headers: Record<string, string> = { Connection: 'close' };
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    const req = https.request(url, { method: 'GET', headers, agent }, (res) => {
      const out = new Headers();
      for (const [k, v] of Object.entries(res.headers)) {
        if (v != null) out.set(k, Array.isArray(v) ? v.join(', ') : String(v));
      }
      const body = Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>;
      resolve(new Response(body, { status: res.statusCode ?? 0, headers: out }));
    });
    req.on('error', reject);
    init?.signal?.addEventListener('abort', () => req.destroy(new Error('This operation was aborted')), { once: true });
    req.end();
  });

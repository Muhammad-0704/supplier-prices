import { NextResponse, type NextRequest } from 'next/server';
import { basicAuth, buildUrl } from '@/lib/onec/odata';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Служебная диагностика OData (только с CRON_SECRET): выполняет один запрос к 1С и сообщает
 * статус, время, размер ответа и список полей первой строки. Данные строк не возвращает.
 * Пример: /api/onec-probe?entity=Catalog_Номенклатура&top=5&select=Ref_Key,Description
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: 'Нет доступа' }, { status: 401 });
  }
  const base = process.env.ONEC_ODATA_URL;
  if (!base) return NextResponse.json({ ok: false, message: 'Не задан ONEC_ODATA_URL' });

  const q = request.nextUrl.searchParams;
  const entity = q.get('entity') || '';
  const params: Record<string, string | undefined> = {
    $format: 'json',
    $top: q.get('top') || '5',
    $select: q.get('select') || undefined,
    $orderby: q.get('orderby') || undefined,
    $filter: q.get('filter') || undefined,
  };
  const url = entity === '$metadata' ? `${base.replace(/\/+$/, '')}/$metadata` : buildUrl(base, entity, params);

  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(q.get('timeout') || 60) * 1000);
  const out: Record<string, unknown> = { entity, params };
  try {
    const res = await fetch(url, { headers: { Authorization: basicAuth(process.env.ONEC_USER || '', process.env.ONEC_PASSWORD || ''), Accept: 'application/json' }, signal: ctrl.signal, cache: 'no-store' });
    out.status = res.status;
    out.headersMs = Date.now() - started;
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes < 400_000) chunks.push(value);
      }
    }
    out.bytes = bytes;
    out.totalMs = Date.now() - started;
    const text = Buffer.concat(chunks).toString('utf8');
    if (entity === '$metadata') {
      // Имена сущностей и полей нужных объектов, без данных
      const want = (q.get('grep') || 'Номенклатура').split(',');
      out.matches = text.split(/<EntityType /).filter((t) => want.some((w) => t.includes(`Name="${w}"`) || t.includes(w))).slice(0, 6)
        .map((t) => ({ name: /Name="([^"]+)"/.exec(t)?.[1], props: [...t.matchAll(/<Property Name="([^"]+)"/g)].map((m) => m[1]).slice(0, 80) }));
    } else if (res.ok) {
      try {
        const body = JSON.parse(text) as { value?: Record<string, unknown>[] };
        out.rows = body.value?.length;
        out.fields = body.value?.[0] ? Object.keys(body.value[0]) : [];
      } catch { out.parse = 'не JSON или обрезан'; }
    } else {
      out.error = text.slice(0, 500);
    }
  } catch (e) {
    out.failedAfterMs = Date.now() - started;
    out.exception = (e as Error).message;
  } finally {
    clearTimeout(timer);
  }
  return NextResponse.json(out);
}

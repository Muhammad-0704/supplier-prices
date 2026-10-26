import { NextResponse, type NextRequest } from 'next/server';
import writeXlsxFile from 'write-excel-file/node';
import { isMonth, mskMonth, summarize } from '@/lib/canteens';
import { costTotals, customerMap, loadCanteens, loadCostSummary, loadIiko, loadReports, loadShipments } from '@/lib/canteens-data';
import { buildMonthWorkbook } from '@/lib/canteens-export';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Месячный отчёт в Excel. Точки — те, что видит вошедший; колонки по закупочным — только руководителю. */
export async function GET(request: NextRequest) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Войдите в аккаунт.' }, { status: 401 });
  const { data: p } = await db.from('profiles').select('canteen_role').eq('id', user.id).maybeSingle();
  if (!p?.canteen_role) return NextResponse.json({ ok: false, message: 'Нет доступа к «Столовым».' }, { status: 403 });

  const m = request.nextUrl.searchParams.get('month');
  const month = isMonth(m) ? m : mskMonth();
  const canteens = await loadCanteens(db);
  const [shipments, reports, costRows, iiko] = await Promise.all([
    loadShipments(db, canteens, month),
    loadReports(db, canteens, month),
    p.canteen_role === 'manager' ? loadCostSummary(db, month).catch(() => []) : Promise.resolve([]),
    loadIiko(db, canteens, month),
  ]);
  const totals = summarize(canteens.map((c) => c.id), customerMap(canteens), shipments, reports, iiko);
  const costs = p.canteen_role === 'manager' ? costTotals(costRows) : null;
  const sheets = buildMonthWorkbook(month, canteens, totals, costs);

  const buffer = await writeXlsxFile(sheets as unknown as Parameters<typeof writeXlsxFile>[0]).toBuffer();
  const name = `Столовые ${month}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="stolovye-${month}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
}

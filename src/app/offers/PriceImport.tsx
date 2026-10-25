'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Segmented } from '@/components/ui';
import { pct, rub } from '@/lib/format';
import { measureText } from '@/lib/measure';
import { compareToItem, extractRows, guessColumns, matchRows, parseCsv, type Columns, type Grid, type Matched, type OurItem } from '@/lib/pricelist';
import { importPriceList } from './actions';

type Filter = 'all' | 'matched' | 'cheaper' | 'unmatched';
type Sheet = { name: string; data: Grid };

const colName = (i: number) => {
  let s = '', n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
};

export function PriceImport({ items, suppliers, supplierNames }: { items: OurItem[]; suppliers: { id: string; name: string }[]; supplierNames: Record<string, string> }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState('');
  const [company, setCompany] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [cols, setCols] = useState<Columns | null>(null);
  const [rows, setRows] = useState<Matched[]>([]);
  const [include, setInclude] = useState<Record<number, boolean>>({});
  const [keepCustom, setKeepCustom] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const grid = sheets[sheetIdx]?.data ?? [];
  const width = Math.max(0, ...grid.slice(0, 50).map((r) => r.length));

  function analyse(g: Grid, c: Columns | null) {
    setCols(c);
    if (!c) { setRows([]); setMsg({ error: 'Не нашли в файле колонки с названием и ценой. Выберите их вручную.' }); return; }
    const m = matchRows(extractRows(g, c), items);
    setRows(m);
    setInclude(Object.fromEntries(m.map((r, i) => [i, !!r.itemId])));
    setMsg(m.length ? {} : { error: 'В выбранных колонках нет строк с ценой.' });
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setMsg({}); setRows([]); setLoading(true); setFileName(f.name);
    try {
      let list: Sheet[];
      if (/\.csv$|\.txt$/i.test(f.name)) {
        const buf = await f.arrayBuffer();
        // CSV из 1С и старого Excel часто в Windows-1251
        let t = new TextDecoder('utf-8').decode(buf);
        if (t.includes('�')) t = new TextDecoder('windows-1251').decode(buf);
        list = [{ name: f.name, data: parseCsv(t) }];
      } else if (/\.xlsx$/i.test(f.name)) {
        const { default: readXlsxFile } = await import('read-excel-file/browser');
        const s = await readXlsxFile(f);
        list = s.map((x) => ({ name: x.sheet, data: x.data as unknown as Grid }));
      } else {
        setMsg({ error: 'Нужен файл .xlsx или .csv. Старый формат .xls откройте в Excel и сохраните как .xlsx.' });
        setLoading(false);
        return;
      }
      // Лист с наибольшим числом строк — скорее всего сам прайс
      const best = list.reduce((b, s, i) => (s.data.length > list[b].data.length ? i : b), 0);
      setSheets(list);
      setSheetIdx(best);
      analyse(list[best].data, guessColumns(list[best].data));
    } catch (e) {
      setMsg({ error: `Не удалось прочитать файл: ${(e as Error).message}` });
    } finally {
      setLoading(false);
    }
  }

  const view = useMemo(() => rows.map((r, i) => {
    const it = r.itemId ? byId.get(r.itemId) : undefined;
    return { i, r, it, cmp: it ? compareToItem(r.row, it) : null };
  }), [rows, byId]);

  const counts = useMemo(() => ({
    all: view.length,
    matched: view.filter((v) => v.it).length,
    cheaper: view.filter((v) => v.cmp?.diff != null && v.cmp.diff < -0.005).length,
    unmatched: view.filter((v) => !v.it).length,
  }), [view]);

  const shown = view.filter((v) => filter === 'all' || (filter === 'matched' ? v.it : filter === 'unmatched' ? !v.it : v.cmp?.diff != null && v.cmp.diff < -0.005));
  const selected = view.filter((v) => include[v.i] && (v.it || keepCustom));

  function setItem(i: number, id: string) {
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, itemId: id || null } : r)));
    setInclude((m) => ({ ...m, [i]: !!id || keepCustom }));
  }

  function save() {
    setMsg({});
    start(async () => {
      const r = await importPriceList({
        supplierId: supplierId || null, company, fileName, validUntil: validUntil || null,
        lines: selected.map((v) => ({
          itemId: v.it?.id ?? null,
          name: v.r.row.name,
          unit: v.it ? v.it.unit : v.r.row.unit,
          price: v.cmp ? v.cmp.price : v.r.row.price,
          note: v.cmp?.converted ? `В прайсе: «${v.r.row.name}» — ${rub(v.r.row.price)}${v.r.row.unit ? ` за ${v.r.row.unit}` : ''}, пересчитано на нашу фасовку` : `В прайсе: «${v.r.row.name}»`,
        })),
      });
      setMsg(r);
      if (r.ok) { setRows([]); setSheets([]); setFileName(''); router.refresh(); }
    });
  }

  return (
    <section className="card-box">
      <h2>Прайс поставщика из файла</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Загрузите прайс в Excel (.xlsx) или CSV. Сервис найдёт колонки с названием и ценой, сопоставит строки с вашими товарами и пересчитает цену на вашу фасовку. Файл читается прямо в браузере, на сервер уходят только отмеченные строки.
      </p>

      <div className="row-form">
        <div className="field">
          <label htmlFor="pi-sup">Поставщик</label>
          <select id="pi-sup" className="select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— новая фирма, не из 1С —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {!supplierId && (
          <div className="field">
            <label htmlFor="pi-name">Название фирмы</label>
            <input id="pi-name" className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="ООО «Ромашка»" />
          </div>
        )}
        <div className="field" style={{ flex: '0 1 170px' }}>
          <label htmlFor="pi-until">Цены действуют до</label>
          <input id="pi-until" className="input" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pi-file">Файл</label>
          <input id="pi-file" className="input file-input" type="file" accept=".xlsx,.csv,.txt" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>

      {loading && <p className="muted">Читаем файл…</p>}
      {msg.error && <div className="notice notice--error">{msg.error}</div>}
      {msg.ok && <div className="notice">{msg.ok} Смотрите во вкладке «Предложения».</div>}

      {sheets.length > 0 && (
        <div className="row-form">
          {sheets.length > 1 && (
            <div className="field" style={{ flex: '0 1 200px' }}>
              <label htmlFor="pi-sheet">Лист</label>
              <select id="pi-sheet" className="select" value={sheetIdx} onChange={(e) => { const i = Number(e.target.value); setSheetIdx(i); analyse(sheets[i].data, guessColumns(sheets[i].data)); }}>
                {sheets.map((s, i) => <option key={i} value={i}>{s.name} ({s.data.length} стр.)</option>)}
              </select>
            </div>
          )}
          {(['name', 'price', 'unit'] as const).map((k) => (
            <div key={k} className="field" style={{ flex: '0 1 200px' }}>
              <label htmlFor={`pi-${k}`}>{k === 'name' ? 'Колонка с названием' : k === 'price' ? 'Колонка с ценой' : 'Колонка с единицей'}</label>
              <select id={`pi-${k}`} className="select" value={cols?.[k] ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : Number(e.target.value);
                  const next: Columns = { header: cols?.header ?? -1, name: cols?.name ?? 0, price: cols?.price ?? 1, unit: cols?.unit ?? null, [k]: v };
                  if (next.name == null || next.price == null) return;
                  analyse(grid, next);
                }}>
                {k === 'unit' && <option value="">нет</option>}
                {Array.from({ length: width }, (_, i) => {
                  const head = cols && cols.header >= 0 ? String(grid[cols.header]?.[i] ?? '') : String(grid.find((r) => r[i] != null)?.[i] ?? '');
                  return <option key={i} value={i}>{colName(i)}{head ? `: ${head.slice(0, 30)}` : ''}</option>;
                })}
              </select>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="bar">
            <Segmented<Filter> label="Какие строки" value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'Все', count: counts.all },
              { value: 'matched', label: 'Наши товары', count: counts.matched },
              { value: 'cheaper', label: 'Дешевле нашей', count: counts.cheaper },
              { value: 'unmatched', label: 'Не найдены', count: counts.unmatched },
            ]} />
            <label className="tog"><input type="checkbox" checked={keepCustom} onChange={(e) => setKeepCustom(e.target.checked)} />Сохранять и ненайденные как товары поставщика</label>
          </div>

          <div style={{ overflowX: 'auto' }} className="sub-card">
            <table className="ot pi-table">
              <thead><tr><th /><th>В прайсе</th><th className="r">Цена</th><th>Наш товар</th><th className="r">Наша лучшая</th><th className="r">Их цена за нашу ед.</th><th className="r">Разница</th></tr></thead>
              <tbody>
                {shown.slice(0, 600).map(({ i, r, it, cmp }) => (
                  <tr key={i} className={include[i] && (it || keepCustom) ? undefined : 'pi-off'}>
                    <td><input type="checkbox" aria-label="Сохранить строку" checked={!!include[i]} disabled={!it && !keepCustom} onChange={(e) => setInclude((m) => ({ ...m, [i]: e.target.checked }))} /></td>
                    <td>{r.row.name}<div className="muted" style={{ fontSize: 12 }}>строка {r.row.line}{r.row.unit ? ` · за ${r.row.unit}` : ''}</div></td>
                    <td className="r pr">{rub(r.row.price)}</td>
                    <td>
                      <select className="select pi-select" value={r.itemId ?? ''} onChange={(e) => setItem(i, e.target.value)} aria-label="Наш товар">
                        <option value="">— нет у нас —</option>
                        {r.candidates.map((c) => <option key={c.id} value={c.id}>{byId.get(c.id)?.name} ({Math.round(c.score * 100)}%)</option>)}
                        {r.itemId && !r.candidates.some((c) => c.id === r.itemId) && <option value={r.itemId}>{byId.get(r.itemId)?.name}</option>}
                      </select>
                      {it && r.candidates[0]?.id === it.id && r.candidates[0].score < 0.7 && <div className="muted" style={{ fontSize: 12 }}>проверьте совпадение</div>}
                    </td>
                    <td className="r sm">{it ? <>{rub(it.bestPrice)}<div>{supplierNames[it.bestSupplierId] ?? ''}</div></> : '—'}</td>
                    <td className="r pr">
                      {cmp ? rub(cmp.price) : '—'}
                      {cmp?.converted && it?.measure && cmp.their && <div className="muted" style={{ fontSize: 11.5, fontWeight: 400 }} title={`У них ${measureText(cmp.their, r.row.unit || 'шт')}, у нас ${measureText(it.measure, it.unit)}`}>пересчёт по фасовке</div>}
                    </td>
                    <td className={`r ${cmp?.diff != null && cmp.diff < -0.005 ? 'diff-lower' : cmp?.diff != null && cmp.diff > 0.005 ? 'diff-higher' : ''}`}>
                      {cmp?.diff == null ? '—' : Math.abs(cmp.diff) < 0.005 ? 'так же' : `${cmp.diff < 0 ? '−' : '+'}${pct(cmp.diff)}`}
                      {cmp?.diff != null && Math.abs(cmp.diff) > 0.6 && <div><Badge tone="rise">проверьте</Badge></div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length > 600 && <div className="sub-card__foot">Показаны первые 600 строк из {shown.length}. Сохранятся все отмеченные.</div>}
          </div>

          <div className="order-save">
            <button className="pb-btn pb-btn--primary" type="button" disabled={pending || !selected.length || (!supplierId && !company.trim())} onClick={save}>
              {pending ? 'Сохраняем…' : `Сохранить предложение · ${selected.length} строк`}
            </button>
            {!supplierId && !company.trim() && <span className="muted" style={{ alignSelf: 'center', fontSize: 13 }}>Выберите поставщика или впишите название фирмы</span>}
          </div>
        </>
      )}
    </section>
  );
}

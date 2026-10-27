/** Экран «Продажи» точки: блоки из iiko. Графики — на CSS, без библиотек; цвета из токенов темы. */
import { dayTitle } from '@/lib/canteens';
import type { CashierStat, DishStat, Flow, HourStat, Menu, Voids, WeekdayStat } from '@/lib/iiko-insights';
import { shortMoney } from '@/lib/canteens-view';
import { num, plural } from '@/lib/format';

const pct = (v: number | null, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits).replace('.', ',')}%`);
const rub = (v: number | null) => (v == null ? '—' : `${num(v)} ₽`);
const qty = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(v);
const ddmm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

export function SalesKpi({ f, menu, voids }: { f: Flow; menu: Menu; voids: Voids | null }) {
  const t = f.avgCheckTrend;
  return (
    <section className="kpi" aria-label="Продажи за месяц">
      <div className="kpi__item">
        <span className="kpi__label">Покупателей</span>
        <span className="kpi__value num">{num(f.checks)}<small> чеков</small></span>
        <span className="kpi__sub">{f.perDay != null ? `в среднем ${num(f.perDay)} в день` : 'нет чеков'}{f.best ? ` · больше всего ${ddmm(f.best.day)}: ${num(f.best.checks)}` : ''}</span>
      </div>
      <div className="kpi__item">
        <span className="kpi__label">Средний чек</span>
        <span className="kpi__value num">{f.avgCheck != null ? num(f.avgCheck) : '—'}<small> ₽</small></span>
        <span className={`kpi__sub ${t && t.change < -0.03 ? 'kpi__sub--warn' : ''}`}>
          {t ? `последние 7 дней ${num(t.last)} ₽, неделей раньше ${num(t.prev)} ₽ (${t.change >= 0 ? '+' : ''}${pct(t.change, 1)})` : 'выручка ÷ число чеков'}
        </span>
      </div>
      <div className="kpi__item">
        <span className="kpi__label">Скидки</span>
        <span className="kpi__value num">{shortMoney(menu.discount)}<small> ₽</small></span>
        <span className="kpi__sub">{menu.discountShare != null ? `${pct(menu.discountShare, 1)} от суммы до скидки` : 'скидок нет'}</span>
      </div>
      {voids && (
        <div className="kpi__item">
          <span className="kpi__label">Удаления и возвраты</span>
          <span className="kpi__value num">{shortMoney(voids.deleted.amount + voids.returns.amount)}<small> ₽</small></span>
          <span className={`kpi__sub ${voids.deleted.noWriteoff > 0 ? 'kpi__sub--warn' : ''}`}>
            {voids.deleted.count} удал. · {voids.returns.count} возвр.{voids.deleted.noWriteoff > 0 ? ` · без списания ${num(voids.deleted.noWriteoff)} ₽` : ''}
          </span>
        </div>
      )}
    </section>
  );
}

/** Чеки по дням: столбик — покупатели, точка — средний чек (своя шкала) */
export function FlowChart({ f, days }: { f: Flow; days: string[] }) {
  const by = new Map(f.byDay.map((d) => [d.day, d]));
  const maxC = Math.max(1, ...f.byDay.map((d) => d.checks));
  const avgs = f.byDay.map((d) => d.avgCheck).filter((v): v is number => v != null);
  const lo = Math.min(...avgs, Infinity), hi = Math.max(...avgs, -Infinity);
  const span = hi - lo || 1;
  return (
    <figure className="sl-flow">
      <div className="sl-flow__plot" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
        {days.map((d) => {
          const x = by.get(d);
          const wkend = new Date(`${d}T12:00:00Z`).getUTCDay() % 6 === 0;
          return (
            <div key={d} className={`sl-flow__col ${wkend ? 'is-wkend' : ''}`} title={x?.checks ? `${dayTitle(d)}: ${num(x.checks)} чеков, средний чек ${rub(x.avgCheck)}, выручка ${rub(x.revenue)}` : `${dayTitle(d)}: нет данных`}>
              {x?.checks ? <span className="sl-flow__bar" style={{ height: `${(x.checks / maxC) * 100}%` }} /> : null}
              {x?.avgCheck != null && <span className="sl-flow__dot" style={{ bottom: `calc(${((x.avgCheck - lo) / span) * 70 + 15}% - 3px)` }} />}
            </div>
          );
        })}
      </div>
      <div className="cn-chart__days" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
        {days.map((d) => { const n = Number(d.slice(8)); return <span key={d}>{n === 1 || n % 5 === 0 ? n : ''}</span>; })}
      </div>
      <figcaption className="cn-legend">
        <span><i className="sl-legend__bar" /> покупатели (чеки), макс. {num(maxC)}</span>
        <span><i className="sl-legend__dot" /> средний чек, от {rub(avgs.length ? lo : null)} до {rub(avgs.length ? hi : null)}</span>
        <span className="muted">светлее — выходные</span>
      </figcaption>
    </figure>
  );
}

export function Weekdays({ rows }: { rows: WeekdayStat[] }) {
  const max = Math.max(1, ...rows.map((r) => r.checks ?? 0));
  const best = rows.reduce<WeekdayStat | null>((m, r) => ((r.checks ?? 0) > (m?.checks ?? 0) ? r : m), null);
  const worst = rows.filter((r) => r.checks != null).reduce<WeekdayStat | null>((m, r) => (!m || (r.checks ?? 0) < (m.checks ?? 0) ? r : m), null);
  return (
    <section className="card-box">
      <h2>Дни недели</h2>
      <p className="muted sl-note">Средний день: сколько людей приходит и сколько тратят.{best && worst && best !== worst ? ` Сильнее всего — ${best.label.toLowerCase()}, слабее — ${worst.label.toLowerCase()}.` : ''}</p>
      <div className="sl-rows" role="table" aria-label="Средний день недели">
        <div className="sl-row sl-row--head" role="row"><span role="columnheader">День</span><span role="columnheader">Людей</span><span role="columnheader" className="r">Выручка</span><span role="columnheader" className="r">Ср. чек</span></div>
        {rows.map((r) => (
          <div key={r.wd} className={`sl-row ${r.wd >= 5 ? 'is-wkend' : ''}`} role="row">
            <span role="cell"><b>{r.label}</b>{r.days ? <span className="muted"> · {r.days}</span> : null}</span>
            <span role="cell" className="sl-bar"><i style={{ width: `${((r.checks ?? 0) / max) * 100}%` }} /><span className="num">{r.checks != null ? num(r.checks) : '—'}</span></span>
            <span role="cell" className="r num">{r.revenue != null ? shortMoney(r.revenue) : '—'}</span>
            <span role="cell" className="r num">{r.avgCheck != null ? num(r.avgCheck) : '—'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Hours({ hours, peak }: { hours: HourStat[]; peak: HourStat | null }) {
  const max = Math.max(1, ...hours.map((h) => h.checks));
  const lunch = hours.filter((h) => h.hour >= 12 && h.hour < 15).reduce((s, h) => s + h.share, 0);
  return (
    <section className="card-box">
      <h2>По часам</h2>
      <p className="muted sl-note">
        {peak ? <>Пик — <b className="sl-ink">{peak.hour}:00–{peak.hour + 1}:00</b>, в среднем {num(peak.checks)} чеков за час. С 12 до 15 — {pct(lunch)} всех покупателей.</> : 'Нет данных по часам.'}
      </p>
      {hours.length > 0 && (
        <figure className="sl-hours">
          <div className="sl-hours__plot" style={{ gridTemplateColumns: `repeat(${hours.length}, 1fr)` }}>
            {hours.map((h) => (
              <div key={h.hour} className="sl-hours__col" title={`${h.hour}:00–${h.hour + 1}:00: в среднем ${num(h.checks)} чеков, ${rub(h.revenue)}`}>
                <span className="sl-hours__val num">{h.checks >= 1 ? Math.round(h.checks) : ''}</span>
                <span className={`sl-hours__bar ${peak?.hour === h.hour ? 'is-peak' : ''}`} style={{ height: `${(h.checks / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="sl-hours__axis" style={{ gridTemplateColumns: `repeat(${hours.length}, 1fr)` }} aria-hidden="true">
            {hours.map((h) => <span key={h.hour}>{h.hour}</span>)}
          </div>
          <figcaption className="muted sl-note">Чеков в среднем за час, по часу закрытия чека</figcaption>
        </figure>
      )}
    </section>
  );
}

export function Categories({ menu }: { menu: Menu }) {
  const max = Math.max(0.0001, ...menu.categories.map((c) => c.share));
  return (
    <section className="card-box">
      <h2>Категории</h2>
      <p className="muted sl-note">Какая доля выручки на что приходится.</p>
      <div className="sl-cats">
        {menu.categories.map((c) => (
          <div key={c.category} className="sl-cat">
            <span className="sl-cat__name">{c.category}</span>
            <span className="sl-cat__bar"><i style={{ width: `${(c.share / max) * 100}%` }} /></span>
            <span className="num sl-cat__pct">{pct(c.share)}</span>
            <span className="num muted sl-cat__sum">{shortMoney(c.revenue)} ₽</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DishTable({ rows, maxShare }: { rows: DishStat[]; maxShare: number }) {
  return (
    <table className="cn-table sl-dishes">
      <thead><tr><th>Блюдо</th><th className="r">Шт.</th><th className="r">Выручка</th><th className="sl-share-col">Доля</th></tr></thead>
      <tbody>
        {rows.map((d, i) => (
          <tr key={d.dish}>
            <td><span className="sl-rank num">{i + 1}</span>{d.dish}<span className="cn-hint">{d.category}{d.price ? ` · ${num(d.price)} ₽` : ''}</span></td>
            <td className="r num">{qty(d.qty)}</td>
            <td className="r num">{num(d.revenue)}</td>
            <td className="sl-share-col"><span className="sl-bar sl-bar--thin"><i style={{ width: `${(d.share / maxShare) * 100}%` }} /><span className="num">{pct(d.share, 1)}</span></span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Dishes({ menu }: { menu: Menu }) {
  const maxShare = Math.max(0.0001, ...menu.top.map((d) => d.share));
  return (
    <section className="card-box">
      <h2>Блюда</h2>
      <div className="sl-split">
        <div>
          <h3 className="sl-h3">Больше всего выручки</h3>
          <div className="cn-scroll"><DishTable rows={menu.top} maxShare={maxShare} /></div>
        </div>
        <div>
          <h3 className="sl-h3">Продаются хуже всего</h3>
          <p className="muted sl-note">Меньше всего штук за месяц. Кандидаты убрать из меню или готовить меньше.</p>
          <ul className="sl-slow">
            {menu.slow.map((d) => (
              <li key={d.dish}>
                <span>{d.dish}<span className="cn-hint">{d.category}</span></span>
                <span className="num r">{qty(d.qty)} шт.<span className="cn-hint">в {d.days} {plural(d.days, 'день', 'дня', 'дней')} · {num(d.revenue)} ₽</span></span>
              </li>
            ))}
            {!menu.slow.length && <li className="muted">Мало данных.</li>}
          </ul>
          <p className="muted sl-note">Всего позиций в продаже: {menu.dishes}.</p>
        </div>
      </div>
    </section>
  );
}

export function Cashiers({ rows }: { rows: CashierStat[] }) {
  // Сравнение со средним по остальным кассирам (медиана при двух кассирах не работает)
  const othersRate = (r: CashierStat) => {
    const o = rows.filter((x) => x !== r);
    const rev = o.reduce((s, x) => s + x.revenue, 0);
    return rev > 0 ? (o.reduce((s, x) => s + x.deleted.amount + x.returns.amount, 0) / rev) * 1000 : null;
  };
  return (
    <section className="card-box">
      <h2>Кассиры</h2>
      <p className="muted sl-note">«На 1000 ₽» — сколько рублей удалено и возвращено на каждую 1000 ₽ выручки кассира. Красным — вдвое выше, чем у остальных.</p>
      <div className="cn-scroll">
        <table className="cn-table sl-staff">
          <thead><tr><th>Кассир</th><th className="r">Смен</th><th className="r">Чеков</th><th className="r">Выручка</th><th className="r">Ср. чек</th><th className="r">Скидки</th><th className="r">Удалено</th><th className="r">Возвраты</th><th className="r">На 1000 ₽</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const base = othersRate(r);
              const hot = rows.length > 1 && r.voidRate != null && base != null && r.voidRate > 1 && r.voidRate >= base * 2;
              return (
                <tr key={r.cashier}>
                  <td><b>{r.cashier}</b></td>
                  <td className="r num">{r.days}</td>
                  <td className="r num">{num(r.checks)}</td>
                  <td className="r num">{num(r.revenue)}</td>
                  <td className="r num">{r.avgCheck != null ? num(r.avgCheck) : '—'}</td>
                  <td className="r num">{r.discount ? num(r.discount) : '—'}</td>
                  <td className="r num">{r.deleted.count ? <>{num(r.deleted.amount)}<span className="cn-hint">{r.deleted.count} поз.</span></> : '—'}</td>
                  <td className="r num">{r.returns.count ? <>{num(r.returns.amount)}<span className="cn-hint">{r.returns.count} поз.</span></> : '—'}</td>
                  <td className={`r num ${hot ? 'sl-hot' : ''}`}>{r.voidRate != null ? r.voidRate.toFixed(1).replace('.', ',') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function VoidList({ v }: { v: Voids }) {
  const kind = (x: Voids['list'][number]) => (x.kind === 'return' ? 'возврат' : x.writeoff === false ? 'удалено без списания' : x.writeoff ? 'удалено со списанием' : 'удалено');
  return (
    <section className="card-box">
      <h2>Удаления и возвраты</h2>
      <p className="muted sl-note">
        Удалено {v.deleted.count} поз. на {num(v.deleted.amount)} ₽, из них без списания — {num(v.deleted.noWriteoff)} ₽. Возвратов {v.returns.count} на {num(v.returns.amount)} ₽.
        {' '}<b className="sl-ink">Без списания</b> — позицию пробили и удалили, а продукт не списали: если еда при этом ушла, деньги не пришли. Это первое, что стоит проверять.
      </p>
      {v.list.length > 0 && <VoidTable rows={v.list.slice(0, 12)} kind={kind} />}
      {v.list.length > 12 && (
        <details className="sl-more">
          <summary>Показать все — {v.list.length}</summary>
          <VoidTable rows={v.list.slice(12)} kind={kind} />
        </details>
      )}
    </section>
  );
}

function VoidTable({ rows, kind }: { rows: Voids['list']; kind: (x: Voids['list'][number]) => string }) {
  return (
        <div className="cn-scroll">
          <table className="cn-table sl-voids">
            <thead><tr><th>День</th><th>Что</th><th>Кассир</th><th>Позиция</th><th className="r">Сумма</th></tr></thead>
            <tbody>
              {rows.map((x, i) => (
                <tr key={i}>
                  <td className="num">{ddmm(x.day)}</td>
                  <td><span className={`sl-tag ${x.kind === 'deleted' && x.writeoff === false ? 'sl-tag--bad' : ''}`}>{kind(x)}</span></td>
                  <td>{x.cashier}</td>
                  <td>{x.dish}{x.qty > 1 ? <span className="muted"> × {qty(x.qty)}</span> : null}</td>
                  <td className="r num">{num(x.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
  );
}

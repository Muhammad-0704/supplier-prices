import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { findActiveTvLink, loadTvToday, tvPointsData } from '@/lib/tv';
import { TvScreen } from './TvScreen';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Экран точек', robots: { index: false, follow: false } };

/** Экран для ТВ в офисе: без входа, по ссылке-ключу из «Доступов». Крупные цифры за сегодня по точкам. */
export default async function TvPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const db = createAdminClient();
  const link = await findActiveTvLink(db, params.token);
  if (!link) {
    return (
      <main className="auth">
        <div className="auth__box">
          <h1>Ссылка недействительна</h1>
          <p className="muted" style={{ margin: 0 }}>Ссылка отключена или набрана с ошибкой. Новую можно выпустить в «Центре Питания» → «Доступы».</p>
        </div>
      </main>
    );
  }

  const { day, points, hours, dishes } = await loadTvToday(db);
  return <TvScreen token={params.token} name={link.name} initialDay={day} initialPoints={tvPointsData(day, points, hours, dishes)} />;
}

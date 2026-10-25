import { redirect } from 'next/navigation';

/** Команда переехала в «Настройки». */
export default function TeamPage() {
  redirect('/settings?tab=team');
}

import { redirect } from 'next/navigation';

/** Смена пароля переехала в «Настройки» → «Профиль». */
export default function AccountPage() {
  redirect('/settings');
}

import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Role } from './types';

export type CanteenRole = 'manager' | 'admin';
export type ServiceId = 'price' | 'canteens';

export interface Access {
  userId: string;
  email: string;
  name: string;
  /** Роль в прайс-доске; null — доступа нет */
  priceRole: Role | null;
  /** Роль в «Центре Питания»; null — доступа нет */
  canteenRole: CanteenRole | null;
  services: ServiceId[];
}

export const SERVICES: Record<ServiceId, { title: string; href: string; about: string; features: string[] }> = {
  price: {
    title: 'Прайс-доска', href: '/price', about: 'Закупочные цены поставщиков',
    features: ['Цены всех поставщиков на одном экране', 'Заявка поставщикам по ритму закупок', 'Предложения цен от поставщиков по ссылке'],
  },
  canteens: {
    title: 'Центр Питания', href: '/canteens', about: 'Точки сети и их цифры',
    features: ['Закупки каждой точки со склада', 'Ежедневный отчёт с телефона', 'Фудкост по точкам и за месяц'],
  },
};

/** Кто вошёл и к каким сервисам у него есть доступ. Без входа — на страницу входа. */
export async function getAccess(): Promise<Access> {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { data: p } = await db.from('profiles').select('full_name, role, canteen_role').eq('id', user.id).maybeSingle();
  const priceRole: Role | null = p?.role === 'manager' ? 'manager' : p?.role === 'staff' ? 'staff' : null;
  const canteenRole: CanteenRole | null = p?.canteen_role === 'manager' ? 'manager' : p?.canteen_role === 'admin' ? 'admin' : null;
  const services: ServiceId[] = [];
  if (priceRole) services.push('price');
  if (canteenRole) services.push('canteens');
  return { userId: user.id, email: user.email ?? '', name: p?.full_name || user.email || '', priceRole, canteenRole, services };
}

/** Страница прайс-доски: без роли в ней — на главную. */
export async function requirePrice(): Promise<Access & { priceRole: Role }> {
  const a = await getAccess();
  if (!a.priceRole) redirect('/');
  return a as Access & { priceRole: Role };
}

/** Страница «Центра Питания»: без роли в них — на главную. */
export async function requireCanteens(): Promise<Access & { canteenRole: CanteenRole }> {
  const a = await getAccess();
  if (!a.canteenRole) redirect('/');
  return a as Access & { canteenRole: CanteenRole };
}

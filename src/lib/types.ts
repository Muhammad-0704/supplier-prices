import type { CheaperAlt } from './compare';
import type { Measure } from './measure';

export type Role = 'manager' | 'staff';

export interface Supplier {
  id: string;
  name: string;
  /** Накладных за последние 90 дней: по этому числу колонки идут слева направо */
  docs90d?: number;
}

/** Последняя цена товара у одного поставщика. */
export interface Offer {
  supplierId: string;
  price: number;
  prevPrice: number | null;
  /** ISO-дата последней закупки (или ручного обновления цены) */
  lastDate: string;
  /** Дата последней закупки по 1С, если цену обновили вручную */
  purchaseDate?: string;
  /** Ручная отметка: цена устарела или обновлена со слов поставщика */
  manual?: ManualMark;
}

export interface ManualMark {
  kind: 'price' | 'stale';
  /** Когда отметили */
  at: string;
  /** Кто отметил */
  by: string | null;
  /** Цена из 1С на момент отметки */
  sourcePrice: number;
  note: string | null;
}

export interface DerivedOffer extends Offer {
  /** Изменение к прошлой закупке у этого поставщика, доля */
  change: number;
  /** Дней с последней закупки */
  ago: number;
  /** На 60+ дней старше самой свежей цены по товару */
  stale: boolean;
}

export interface BoardItem {
  id: string;
  name: string;
  unit: string;
  category: string;
  offers: DerivedOffer[];
  bestSupplierId: string;
  /** Лучшая актуальная цена за единицу товара */
  bestPrice: number;
  currentSupplierId: string;
  /** Фасовка: сколько кг / л / шт в единице товара. null — сравнивать за кг нельзя */
  measure?: Measure | null;
  /** Почти такой же товар в другой фасовке заметно дешевле за кг */
  cheaperAlt?: CheaperAlt | null;
  /** Дней с последней закупки у любого поставщика */
  agoAny: number;
  rare: boolean;
  /** Разброс актуальных цен, доля от минимальной */
  spread: number;
  favorite: boolean;
  hidden: boolean;
  /** Предложения поставщиков по ссылкам (последнее от каждой фирмы, не отклонённое), дешёвые первыми */
  proposals?: Proposal[];
  /** Только для руководителя: переплата за единицу и в месяц */
  overUnit?: number;
  overMonth?: number;
  monthlyQty?: number;
}

export interface Proposal {
  company: string;
  price: number;
  date: string;
  status: 'new' | 'accepted';
  minQty: string | null;
}

export interface SyncInfo {
  /** Статус последнего запуска */
  status: 'running' | 'ok' | 'error' | 'never';
  /** Когда последний раз данные успешно пришли из 1С */
  lastOkAt: string | null;
  message: string | null;
}

export interface BoardData {
  role: Role;
  userName: string;
  suppliers: Supplier[];
  items: BoardItem[];
  sync: SyncInfo;
  rareDays: number;
  mock: boolean;
}

export interface HistoryPoint {
  supplierId: string;
  date: string;
  price: number;
  docNumber: string | null;
}

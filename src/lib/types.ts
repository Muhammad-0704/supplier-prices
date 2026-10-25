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
  /** ISO-дата последней закупки */
  lastDate: string;
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
  currentSupplierId: string;
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

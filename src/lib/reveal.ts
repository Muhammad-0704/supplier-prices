/** Что поставщик видит по своей ссылке. Общие подписи для формы ссылки, списка ссылок и страницы поставщика. */
export type Reveal = 'price' | 'verdict' | 'none';

export const REVEAL_OPTIONS: { value: Reveal; title: string; hint: string }[] = [
  { value: 'verdict', title: 'Только «подходит / не подходит»', hint: 'Нашу цену не видит. После отправки узнаёт по каждому товару, ниже его цена нашей или выше.' },
  { value: 'price', title: 'Нашу цену', hint: 'Видит нашу текущую лучшую цену прямо при заполнении и сразу понимает, на сколько нужно опустить.' },
  { value: 'none', title: 'Ничего', hint: 'Просто отправляет цены. Сравнения не видит ни до, ни после.' },
];

export const REVEAL_SHORT: Record<Reveal, string> = { price: 'видит нашу цену', verdict: 'видит «подходит / не подходит»', none: 'сравнения не видит' };

export const isReveal = (v: unknown): v is Reveal => v === 'price' || v === 'verdict' || v === 'none';

/** Решение по строке предложения, как его видит поставщик */
export const DECISION: Record<'new' | 'accepted' | 'rejected', { text: string; tone: 'role' | 'best' | 'rise' }> = {
  new: { text: 'на рассмотрении', tone: 'role' },
  accepted: { text: 'принято', tone: 'best' },
  rejected: { text: 'отклонено', tone: 'rise' },
};

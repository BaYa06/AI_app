/**
 * Текст карточки с подстраховкой для старых данных (plan/new/code_cleanup.md, Clean 6d).
 *
 * Поля карточки — `frontText` / `backText`. Старые карточки на устройстве (ранние версии и
 * гостевой импорт из библиотеки до Clean 6c) хранят `front` / `back` — их по-прежнему читаем.
 */
import type { Card } from '@/types';

/** Карточка, у которой могут быть старые поля front/back. */
export type LegacyCard = Card & { front?: string; back?: string };

/** Лицевая сторона: frontText, иначе старое front, иначе ''. */
export function cardFront(card: Card): string {
  return card.frontText ?? (card as LegacyCard).front ?? '';
}

/** Оборот: backText, иначе старое back, иначе ''. */
export function cardBack(card: Card): string {
  return card.backText ?? (card as LegacyCard).back ?? '';
}

/**
 * Откуда набор (plan/new/teacher_cabinet.md, Teacher 31): значок в строке набора вместо даты.
 * Учебник — по isOfficial; остальное — поле origin; старые наборы без origin — общий значок.
 */
import type { CardSet, SetOrigin } from '@/types';

const ORIGINS: SetOrigin[] = ['manual', 'ai', 'file', 'library', 'share'];

/** Значение с сервера или из кэша: неизвестное и пустое — нет происхождения */
export function parseSetOrigin(value: unknown): SetOrigin | undefined {
  return ORIGINS.includes(value as SetOrigin) ? (value as SetOrigin) : undefined;
}

export type SetOriginIcon = 'book' | SetOrigin | 'set';

export function setOriginIcon(set: Pick<CardSet, 'isOfficial' | 'origin'>): SetOriginIcon {
  if (set.isOfficial) return 'book';
  return parseSetOrigin(set.origin) ?? 'set';
}

/** Подпись для экранного диктора */
export const SET_ORIGIN_LABEL: Record<SetOriginIcon, string> = {
  book: 'из учебника',
  manual: 'создан вручную',
  ai: 'импорт через ИИ',
  file: 'импорт из файла',
  library: 'из библиотеки',
  share: 'по ссылке',
  set: 'набор',
};

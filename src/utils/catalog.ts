/**
 * Подписи каталога библиотеки (plan/new/library_catalog.md): уровень, язык / раздел, путь подборки.
 * Чистые функции — используются экранами «Библиотека», «Предмет», «Подборка» и поиском.
 */
import { getLanguageLabel } from '@/constants/languages';
import { pluralize } from './index';

/** Шкала stages: ключ в базе → подпись. */
const STAGE_LABELS: Record<string, string> = {
  basic: 'Основы',
  advanced: 'Углублённо',
};

/** A2 → «A2», basic → «Основы». */
export function levelLabel(level: string | null | undefined): string {
  if (!level) return '';
  return STAGE_LABELS[level] ?? level;
}

/** Название языка или раздела: у раздела — с сервера, у языка — по коду. */
export function trackName(c: { track: string | null; trackTitle: string | null }): string {
  if (!c.track) return '';
  return c.trackTitle || getLanguageLabel(c.track);
}

/** «Английский · A2» — только заполненные части. */
export function collectionPath(c: {
  track: string | null;
  trackTitle: string | null;
  level: string | null;
}): string {
  return [trackName(c), levelLabel(c.level)].filter(Boolean).join(' · ');
}

export function setsCountLabel(n: number): string {
  return `${n} ${pluralize(n, 'набор', 'набора', 'наборов')}`;
}

export function cardsCountLabel(n: number): string {
  return `${n} ${pluralize(n, 'карточка', 'карточки', 'карточек')}`;
}

/** «добавлено 3 из 8» — прогресс обучения не считаем, только добавленные наборы. */
export function addedLabel(added: number, total: number): string {
  return `добавлено ${added} из ${total}`;
}

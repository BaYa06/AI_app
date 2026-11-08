/** События: Наборы и карточки (Clean 9 — из Analytics без изменений). */
import { log } from './core';

export const contentEvents = {
  // ═══════════════════════════════════════════════════════════════════════════
  // НАБОРЫ КАРТОЧЕК
  // Зачем: понять как юзеры создают контент. Если set_created много,
  // но study_session_start мало — юзеры создают наборы, но не учатся.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер создал новый набор карточек.
   */
  setCreated: (cardCount: number, hasDescription: boolean) =>
    log('set_created', { card_count: cardCount, has_description: hasDescription }),

  /**
   * Юзер открыл детальную страницу набора.
   * Зачем: видим какие наборы просматривают, но не изучают (set_viewed без study_session_start).
   */
  setViewed: (setId: string, cardCount: number, progressPercent: number) =>
    log('set_viewed', {
      set_id: setId,
      card_count: cardCount,
      progress_percent: Math.round(progressPercent),
    }),

  /**
   * Юзер удалил набор.
   * Зачем: если удалений много — юзеры создают случайные наборы. Нужны шаблоны.
   */
  setDeleted: (cardCount: number) => log('set_deleted', { card_count: cardCount }),

  /**
   * Юзер добавил набор из публичной библиотеки в свою коллекцию.
   */
  setImportedFromLibrary: (setId: string) => log('set_imported_from_library', { set_id: setId }),

  /**
   * Юзер импортировал CSV / Anki / Quizlet.
   */
  setImportedExternal: (source: 'csv' | 'anki' | 'quizlet', cardCount: number) =>
    log('set_imported_external', { source, card_count: cardCount }),

  // ═══════════════════════════════════════════════════════════════════════════
  // КАРТОЧКИ
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер создал карточку вручную.
   * Зачем: baseline для сравнения с AI-генерацией.
   */
  cardCreatedManual: () => log('card_created_manual'),

  /**
   * Карточка создана через AI-генерацию.
   */
  cardCreatedAI: () => log('card_created_ai'),
};

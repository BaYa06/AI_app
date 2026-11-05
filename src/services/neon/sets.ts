/** Наборы и карточки пользователя (Clean 9 — методы NeonService без изменений). */
import type { Card, CardSet, UpdateCardInput, SetKind } from '@/types';
import { log } from '@/utils/logger';
import { callDataApi, type LoadOptions, NetworkLoadError, mapCardRow, mapSetRow } from './core';

export const setsApi = {
  /**
   * Загрузить все наборы карточек пользователя
   */
  async loadSets(userId?: string, options?: LoadOptions): Promise<CardSet[]> {
    if (!userId) {
      log.warn('Neon', 'userId не передан, пропускаем загрузку наборов');
      return [];
    }
    const sets = await callDataApi<any[]>('loadSets', {}, 'GET');
    if (sets === null && options?.throwOnError) throw new NetworkLoadError('loadSets');
    return (sets || []).map(mapSetRow);
  },

  /**
   * Загрузить карточки для набора
   */
  async loadCardsBySet(setId: string): Promise<Card[]> {
    const cards = await callDataApi<any[]>('loadCardsBySet', { setId }, 'GET');
    return (cards || []).map(mapCardRow);
  },

  /**
   * Загрузить все карточки: свои наборы + наборы курсов, где пользователь ученик (с его прогрессом)
   */
  async loadAllCards(userId?: string, options?: LoadOptions): Promise<Card[]> {
    if (!userId) {
      log.warn('Neon', 'userId не передан, пропускаем загрузку карточек');
      return [];
    }
    const cards = await callDataApi<any[]>('loadAllCards', {}, 'GET');
    if (cards === null && options?.throwOnError) throw new NetworkLoadError('loadAllCards');
    return (cards || []).map(mapCardRow);
  },

  /**
   * Обновить содержимое карточки (текст, медиа)
   */
  async updateCard(cardId: string, data: UpdateCardInput): Promise<boolean> {
    return (await callDataApi<boolean>('updateCard', { cardId, data })) === true;
  },

  /**
   * Создать новый набор карточек (владелец — текущий пользователь)
   */
  async createSet(payload: {
    id: string;
    userId?: string;
    courseId?: string | null;
    title: string;
    description?: string;
    category?: string;
    languageFrom?: string;
    languageTo?: string;
    kind?: SetKind;
    isPublic?: boolean;
    createdAt?: number;
    updatedAt?: number;
  }): Promise<boolean> {
    const { userId: _ignored, ...rest } = payload;
    return (await callDataApi<boolean>('createSet', rest)) === true;
  },

  /**
   * Создать одну карточку
   */
  async createCard(card: Card): Promise<boolean> {
    return (await callDataApi<boolean>('createCard', { card })) === true;
  },

  /**
   * Массовое создание карточек (для импорта)
   */
  async createCardsBatch(cards: Card[]): Promise<boolean> {
    if (cards.length === 0) return true;
    return (await callDataApi<boolean>('createCardsBatch', { cards })) === true;
  },

  /**
   * Удалить набор карточек вместе с карточками
   */
  async deleteSet(setId: string): Promise<boolean> {
    return (await callDataApi<boolean>('deleteSet', { setId })) === true;
  },

  /**
   * Удалить карточку
   */
  async deleteCard(cardId: string): Promise<boolean> {
    return (await callDataApi<boolean>('deleteCard', { cardId })) === true;
  },

  // ==============================================
  // COURSES API
  // ==============================================

  /**
   * Обновить мета-данные набора (title, description, category, languageFrom, languageTo, kind)
   */
  async updateSetMeta(
    setId: string,
    fields: {
      title?: string;
      description?: string;
      category?: string;
      languageFrom?: string;
      languageTo?: string;
      kind?: SetKind;
    }
  ): Promise<boolean> {
    return (await callDataApi<boolean>('updateSetMeta', { setId, fields })) === true;
  },

  /**
   * Обновить course_id у набора
   */
  async updateSetCourse(setId: string, courseId: string | null): Promise<boolean> {
    return (await callDataApi<boolean>('updateSetCourse', { setId, courseId })) === true;
  },
};

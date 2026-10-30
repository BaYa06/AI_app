/**
 * Добавить набор по ссылке себе (plan/new/share_set.md, Share 4).
 * - Аккаунт: копия на сервере (api/share.js import), потом подгружаем данные — набор появится в списке.
 * - Гость (анонимный вход): на сервере у него нет записи, поэтому копируем на устройство,
 *   как гостевой импорт библиотеки (LibrarySetDetailScreen).
 */

import { v4 as uuid } from 'uuid';
import { useSetsStore, useCardsStore } from '@/store';
import type { Card, CardSet } from '@/types';
import { DatabaseService } from './DatabaseService';
import { ShareService, ShareApiError, type SharePreview } from './ShareService';

export interface ShareImportResult {
  setId: string;
  /** Набор уже был добавлен в это место раньше — открываем существующую копию. */
  alreadyImported: boolean;
}

async function importAsGuest(
  preview: SharePreview,
  courseId: string | null,
  userId: string,
): Promise<ShareImportResult> {
  const sharedCards = await ShareService.getAllCards(preview.code);
  const now = Date.now();
  const setId = uuid();

  const newSet: CardSet = {
    id: setId,
    userId,
    courseId,
    title: preview.set.title,
    description: preview.set.description,
    category: (preview.set.category || 'general') as CardSet['category'],
    tags: [],
    icon: undefined,
    color: undefined,
    languageFrom: preview.set.languageFrom || 'en',
    languageTo: preview.set.languageTo || 'ru',
    isPublic: false,
    createdAt: now,
    updatedAt: now,
    lastStudiedAt: undefined,
    cardCount: sharedCards.length,
    newCount: sharedCards.length,
    learningCount: 0,
    reviewCount: 0,
    masteredCount: 0,
    isFavorite: false,
    isArchived: false,
  };

  const newCards: Card[] = sharedCards.map((c) => ({
    id: uuid(),
    setId,
    frontText: c.front,
    backText: c.back,
    example: c.example ?? undefined,
    wordForm: c.wordForm ?? undefined,
    wordType: (c.wordType ?? undefined) as Card['wordType'],
    createdAt: now,
    updatedAt: now,
    learningStep: 0,
    nextReviewDate: now,
    lastReviewDate: 0,
    status: 'new',
  }));

  // В store напрямую, минуя SyncQueue (гость не записан в NeonDB)
  const setsState = useSetsStore.getState();
  useSetsStore.setState({
    sets: { ...setsState.sets, [setId]: newSet },
    setsOrder: [setId, ...setsState.setsOrder],
  });
  DatabaseService.saveSets();

  const cardsState = useCardsStore.getState();
  const cards = { ...cardsState.cards };
  const ids: string[] = [];
  for (const card of newCards) {
    cards[card.id] = card;
    ids.push(card.id);
  }
  useCardsStore.setState({ cards, cardsBySet: { ...cardsState.cardsBySet, [setId]: ids } });
  DatabaseService.saveCards();

  return { setId, alreadyImported: false };
}

/**
 * @param serverCourseId курс на сервере или null. Курс, созданный только что и ещё не дошедший
 *   до сервера, передавайте в `localCourseId`: копия ляжет в «Мои наборы», а потом переедет
 *   в курс через обычную синхронизацию (updateSet → очередь).
 */
export async function importSharedSet(params: {
  preview: SharePreview;
  userId: string;
  isGuest: boolean;
  serverCourseId: string | null;
  localCourseId?: string | null;
}): Promise<ShareImportResult> {
  const { preview, userId, isGuest, serverCourseId, localCourseId } = params;
  if (isGuest) return importAsGuest(preview, localCourseId ?? serverCourseId, userId);

  let result: ShareImportResult;
  try {
    const setId = await ShareService.importSet(preview.code, serverCourseId);
    result = { setId, alreadyImported: false };
  } catch (e) {
    if (e instanceof ShareApiError && e.code === 'already_imported' && typeof e.payload.setId === 'string') {
      result = { setId: e.payload.setId, alreadyImported: true };
    } else {
      throw e;
    }
  }

  // Новая копия есть только на сервере — подтягиваем, чтобы она появилась в списке и открылась
  if (!useSetsStore.getState().sets[result.setId]) {
    await DatabaseService.loadAll();
  }
  if (localCourseId && !result.alreadyImported && useSetsStore.getState().sets[result.setId]) {
    useSetsStore.getState().updateSet(result.setId, { courseId: localCourseId });
  }
  return result;
}

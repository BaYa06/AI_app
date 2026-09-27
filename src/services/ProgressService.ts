/**
 * Ответы ученика по карточкам.
 * Экран сразу видит новый уровень (applyAnswer — та же логика, что на сервере), а сам ответ
 * уходит через очередь в api/progress.js, где уровень пересчитывается и сохраняется.
 * Офлайн ответы копятся в очереди и отправляются по порядку, когда появится сеть.
 */
import { v4 as uuid } from 'uuid';
import type { Card, Rating } from '@/types';
import { applyAnswer, type AnswerMode } from './SRSService';
import { SyncQueueService } from './SyncQueueService';
import { useCardsStore, type SubmitAnswerPayload } from '@/store/cardsStore';

/** Сколько раз пробовать отправить ответ — ответы без сети не должны теряться */
const ANSWER_MAX_RETRIES = 20;

export const ProgressService = {
  /**
   * Записать ответ.
   * - test: chosen — id карточки выбранного варианта;
   * - builder: chosen — собранное слово;
   * - flashcard: selfRating — самооценка 1..4.
   * correct — только для мгновенного отклика; сервер проверяет ответ сам.
   */
  recordAnswer(
    card: Card,
    answer: { mode: AnswerMode; correct: boolean; chosen?: string; selfRating?: Rating; timeSpentMs?: number },
  ): void {
    const answeredAt = Date.now();
    const next = applyAnswer(card, answer, answeredAt);
    useCardsStore.getState().updateCardSRS(card.id, next);

    const payload: SubmitAnswerPayload = {
      answerId: uuid(),
      cardId: card.id,
      mode: answer.mode,
      chosen: answer.chosen,
      selfRating: answer.selfRating,
      answeredAt,
      timeSpentMs: answer.timeSpentMs,
    };
    SyncQueueService.enqueue('submitAnswer', payload, ANSWER_MAX_RETRIES);
  },
};

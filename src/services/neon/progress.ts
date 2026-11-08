/** Ответы (серверный SRS) (Clean 9 — методы NeonService без изменений). */
import { getAccessToken } from '../auth/session';
import { apiFetch } from '../api/client';
import { log } from '@/utils/logger';
import { authHeaders } from './core';

export const progressApi = {
  /**
   * Отправить ответы ученика (до 50 за раз). Уровень и дату повторения считает сервер —
   * в ответе его итоговое состояние каждой карточки. null — нет сессии/сети/ошибка сервера.
   */
  async submitAnswers(
    answers: Array<{
      answerId: string;
      cardId: string;
      mode: 'test' | 'builder' | 'flashcard';
      chosen?: string;
      selfRating?: number;
      answeredAt: number;
      timeSpentMs?: number;
    }>
  ): Promise<Array<{
    answerId: string;
    cardId: string;
    status: 'ok' | 'duplicate' | 'rejected';
    reason?: string;
    learningStep: number | null;
    nextReview: number | null;
    lastReviewed: number | null;
    /** Очки рейтинга за этот ответ */
    points: number;
  }> | null> {
    const token = await getAccessToken();
    if (!token) return null;
    try {
      const res = await apiFetch('progress', {
        method: 'POST',
        query: { action: 'answer' },
        headers: authHeaders(token),
        auth: 'none',
        body: { answers },
      });
      if (!res.response) {
        log.warn('Neon', 'Progress API network error', res.error.original);
        return null;
      }
      const json = res.json;
      if (!res.ok) {
        (res.status >= 500 ? log.error : log.warn)(
          'Neon',
          'Progress API failed',
          res.status,
          json?.error
        );
        // Некорректный ответ не исправится повтором — не держим его в очереди
        return res.status === 400 ? [] : null;
      }
      return json.results;
    } catch (error) {
      log.warn('Neon', 'Progress API network error', error);
      return null;
    }
  },
};

/**
 * API Service для работы с Neon PostgreSQL
 * @description Сервис для загрузки данных из базы данных
 */

import { neon } from '@neondatabase/serverless';
import type { Card, CardSet } from '@/types';

// Используем переменную окружения для подключения
const getConnectionString = () => {
  // Для веба используем переменные из .env.local
  if (typeof window !== 'undefined') {
    // В production это должно быть через API endpoint
    // Но для разработки можем напрямую подключиться
    return process.env.POSTGRES_URL || '';
  }
  return '';
};

export const NeonService = {
  /**
   * Загрузить все наборы карточек
   */
  async loadSets(): Promise<CardSet[]> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        console.warn('POSTGRES_URL не настроен');
        return [];
      }

      const sql = neon(connectionString);
      
      const sets = await sql`
        SELECT 
          id,
          user_id,
          title,
          description,
          category,
          language_from,
          language_to,
          is_public,
          created_at,
          updated_at,
          total_cards,
          mastered_cards,
          studying_cards
        FROM card_sets
        WHERE is_public = true
        ORDER BY created_at DESC
      `;

      return sets.map(set => ({
        id: set.id,
        userId: set.user_id,
        title: set.title,
        description: set.description || '',
        category: set.category || 'Общие',
        languageFrom: set.language_from || 'de',
        languageTo: set.language_to || 'ru',
        isPublic: set.is_public,
        createdAt: new Date(set.created_at).toISOString(),
        updatedAt: new Date(set.updated_at).toISOString(),
        totalCards: set.total_cards || 0,
        masteredCards: set.mastered_cards || 0,
        studyingCards: set.studying_cards || 0,
      }));
    } catch (error) {
      console.error('Failed to load sets:', error);
      return [];
    }
  },

  /**
   * Загрузить карточки для набора
   */
  async loadCardsBySet(setId: string): Promise<Card[]> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        console.warn('POSTGRES_URL не настроен');
        return [];
      }

      const sql = neon(connectionString);
      
      const cards = await sql`
        SELECT 
          id,
          set_id,
          front,
          back,
          example,
          image_url,
          audio_url,
          created_at,
          interval,
          ease_factor,
          repetitions,
          next_review,
          last_reviewed,
          status
        FROM cards
        WHERE set_id = ${setId}
        ORDER BY created_at ASC
      `;

      return cards.map(card => ({
        id: card.id,
        setId: card.set_id,
        front: card.front,
        back: card.back,
        example: card.example || '',
        imageUrl: card.image_url,
        audioUrl: card.audio_url,
        createdAt: new Date(card.created_at).toISOString(),
        // SRS данные
        interval: card.interval || 0,
        easeFactor: parseFloat(card.ease_factor) || 2.5,
        repetitions: card.repetitions || 0,
        nextReview: card.next_review ? new Date(card.next_review).toISOString() : new Date().toISOString(),
        lastReviewed: card.last_reviewed ? new Date(card.last_reviewed).toISOString() : undefined,
        status: card.status as 'new' | 'learning' | 'review' | 'mastered',
      }));
    } catch (error) {
      console.error('Failed to load cards:', error);
      return [];
    }
  },

  /**
   * Загрузить все карточки
   */
  async loadAllCards(): Promise<Card[]> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        console.warn('POSTGRES_URL не настроен');
        return [];
      }

      const sql = neon(connectionString);
      
      const cards = await sql`
        SELECT 
          id,
          set_id,
          front,
          back,
          example,
          image_url,
          audio_url,
          created_at,
          interval,
          ease_factor,
          repetitions,
          next_review,
          last_reviewed,
          status
        FROM cards
        ORDER BY created_at ASC
      `;

      return cards.map(card => ({
        id: card.id,
        setId: card.set_id,
        front: card.front,
        back: card.back,
        example: card.example || '',
        imageUrl: card.image_url,
        audioUrl: card.audio_url,
        createdAt: new Date(card.created_at).toISOString(),
        // SRS данные
        interval: card.interval || 0,
        easeFactor: parseFloat(card.ease_factor) || 2.5,
        repetitions: card.repetitions || 0,
        nextReview: card.next_review ? new Date(card.next_review).toISOString() : new Date().toISOString(),
        lastReviewed: card.last_reviewed ? new Date(card.last_reviewed).toISOString() : undefined,
        status: card.status as 'new' | 'learning' | 'review' | 'mastered',
      }));
    } catch (error) {
      console.error('Failed to load all cards:', error);
      return [];
    }
  },

  /**
   * Обновить SRS-поля карточки
   */
  async updateCardSRS(
    cardId: string,
    data: Partial<Pick<Card, 'interval' | 'easeFactor' | 'repetitions' | 'nextReviewDate' | 'lastReviewDate' | 'status'>>
  ): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        console.warn('POSTGRES_URL не настроен, пропускаем обновление карточки');
        return false;
      }

      const sql = neon(connectionString);

      // Нормализуем значения для SQL
      const interval = data.interval != null ? Math.round(data.interval) : null;
      const easeFactor = data.easeFactor != null ? Number(data.easeFactor.toFixed(2)) : null;
      const nextReview = data.nextReviewDate ? new Date(data.nextReviewDate).toISOString() : null;
      const lastReviewed = data.lastReviewDate ? new Date(data.lastReviewDate).toISOString() : null;

      await sql`
        UPDATE cards
        SET
          interval = COALESCE(${interval}::int, interval),
          ease_factor = COALESCE(${easeFactor}::numeric, ease_factor),
          repetitions = COALESCE(${data.repetitions}::int, repetitions),
          next_review = COALESCE(${nextReview}::timestamptz, next_review),
          last_reviewed = COALESCE(${lastReviewed}::timestamptz, last_reviewed),
          status = COALESCE(${data.status}, status)
        WHERE id = ${cardId}
      `;

      return true;
    } catch (error) {
      console.error('Failed to update card in Neon:', error);
      return false;
    }
  },
};

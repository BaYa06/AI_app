/**
 * API Service для работы с Neon PostgreSQL
 * @description Сервис для загрузки данных из базы данных
 */

import { neon } from '@neondatabase/serverless';
import type { Card, CardSet, CardStatus } from '@/types';

// Используем переменную окружения для подключения
const getConnectionString = () => {
  const envUrl =
    process.env.POSTGRES_URL ||
    process.env.EXPO_PUBLIC_POSTGRES_URL ||
    process.env.REACT_APP_POSTGRES_URL ||
    process.env.NEXT_PUBLIC_POSTGRES_URL ||
    (globalThis as any)?.POSTGRES_URL ||
    '';

  if (envUrl) return envUrl;

  // Для веба можно прокинуть в window.POSTGRES_URL
  if (typeof window !== 'undefined' && (window as any).POSTGRES_URL) {
    return (window as any).POSTGRES_URL as string;
  }

  return '';
};

const DEFAULT_USER_ID = process.env.POSTGRES_DEFAULT_USER_ID || '00000000-0000-0000-0000-000000000001';

/**
 * Определяет статус карточки на основе learningStep
 */
function getStatusFromStep(learningStep: number): CardStatus {
  if (learningStep === 0) return 'new';
  if (learningStep <= 2) return 'learning';
  if (learningStep <= 4) return 'young';
  return 'mature';
}

export const NeonService = {
  isEnabled(): boolean {
    return Boolean(getConnectionString());
  },

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
        tags: [],
        createdAt: new Date(set.created_at).getTime(),
        updatedAt: new Date(set.updated_at).getTime(),
        cardCount: set.total_cards || 0,
        newCount: 0,
        learningCount: set.studying_cards || 0,
        reviewCount: 0,
        masteredCount: set.mastered_cards || 0,
        isPublic: set.is_public,
        isFavorite: false,
        isArchived: false,
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
          learning_step,
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
        frontText: card.front,
        backText: card.back,
        example: card.example || '',
        frontImage: card.image_url,
        backImage: undefined,
        frontAudio: card.audio_url,
        backAudio: undefined,
        createdAt: new Date(card.created_at).getTime(),
        updatedAt: new Date(card.created_at).getTime(),
        // SRS данные
        learningStep: card.learning_step || 0,
        nextReviewDate: card.next_review ? new Date(card.next_review).getTime() : Date.now(),
        lastReviewDate: card.last_reviewed ? new Date(card.last_reviewed).getTime() : Date.now(),
        status: getStatusFromStep(card.learning_step || 0),
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
          learning_step,
          next_review,
          last_reviewed,
          status
        FROM cards
        ORDER BY created_at ASC
      `;

      return cards.map(card => ({
        id: card.id,
        setId: card.set_id,
        frontText: card.front,
        backText: card.back,
        example: card.example || '',
        frontImage: card.image_url,
        backImage: undefined,
        frontAudio: card.audio_url,
        backAudio: undefined,
        createdAt: new Date(card.created_at).getTime(),
        updatedAt: new Date(card.created_at).getTime(),
        // SRS данные
        learningStep: card.learning_step || 0,
        nextReviewDate: card.next_review ? new Date(card.next_review).getTime() : Date.now(),
        lastReviewDate: card.last_reviewed ? new Date(card.last_reviewed).getTime() : Date.now(),
        status: getStatusFromStep(card.learning_step || 0),
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
    data: Partial<Pick<Card, 'learningStep' | 'nextReviewDate' | 'lastReviewDate' | 'status'>>
  ): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        console.warn('POSTGRES_URL не настроен, пропускаем обновление карточки');
        return false;
      }

      const sql = neon(connectionString);

      // Нормализуем значения для SQL
      const learningStep = data.learningStep != null ? data.learningStep : null;
      const nextReview = data.nextReviewDate ? new Date(data.nextReviewDate).toISOString() : null;
      const lastReviewed = data.lastReviewDate ? new Date(data.lastReviewDate).toISOString() : null;

      await sql`
        UPDATE cards
        SET
          learning_step = COALESCE(${learningStep}::int, learning_step),
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

  /**
   * Создать новый набор карточек
   */
  async createSet(payload: {
    id: string;
    userId?: string;
    title: string;
    description?: string;
    category?: string;
    languageFrom?: string;
    languageTo?: string;
    isPublic?: boolean;
    createdAt?: number;
    updatedAt?: number;
  }): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        console.warn('POSTGRES_URL не настроен, пропускаем сохранение набора');
        return false;
      }

      const sql = neon(connectionString);
      const now = new Date();

      await sql`
        INSERT INTO card_sets (
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
        ) VALUES (
          ${payload.id},
          ${payload.userId || DEFAULT_USER_ID},
          ${payload.title},
          ${payload.description || null},
          ${payload.category || 'custom'},
          ${payload.languageFrom || 'de'},
          ${payload.languageTo || 'ru'},
          ${payload.isPublic ?? false},
          ${payload.createdAt ? new Date(payload.createdAt).toISOString() : now.toISOString()},
          ${payload.updatedAt ? new Date(payload.updatedAt).toISOString() : now.toISOString()},
          0,
          0,
          0
        )
        ON CONFLICT (id) DO NOTHING
      `;

      return true;
    } catch (error) {
      console.error('Failed to create set in Neon:', error);
      return false;
    }
  },

  /**
   * Создать одну карточку
   */
  async createCard(card: Card): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        console.warn('POSTGRES_URL не настроен, пропускаем сохранение карточки');
        return false;
      }

      const sql = neon(connectionString);

      await sql`
        INSERT INTO cards (
          id,
          set_id,
          front,
          back,
          example,
          image_url,
          audio_url,
          created_at,
          next_review,
          last_reviewed,
          status
        ) VALUES (
          ${card.id},
          ${card.setId},
          ${card.frontText},
          ${card.backText},
          ${card.example || null},
          ${card.frontImage || null},
          ${card.frontAudio || null},
          ${new Date(card.createdAt).toISOString()},
          ${new Date(card.nextReviewDate).toISOString()},
          ${card.lastReviewDate ? new Date(card.lastReviewDate).toISOString() : null},
          ${card.status}
        )
        ON CONFLICT (id) DO NOTHING
      `;

      await sql`
        UPDATE card_sets 
        SET total_cards = total_cards + 1
        WHERE id = ${card.setId}
      `;

      return true;
    } catch (error) {
      console.error('Failed to create card in Neon:', error);
      return false;
    }
  },

  /**
   * Массовое создание карточек (для импорта)
   */
  async createCardsBatch(cards: Card[]): Promise<boolean> {
    if (cards.length === 0) return true;

    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        console.warn('POSTGRES_URL не настроен, пропускаем пакетное сохранение карточек');
        return false;
      }

      const sql = neon(connectionString);

      const values = cards.map((card) => sql`
        (${card.id},
         ${card.setId},
         ${card.frontText},
         ${card.backText},
         ${card.example || null},
         ${card.frontImage || null},
         ${card.frontAudio || null},
         ${new Date(card.createdAt).toISOString()},
         ${new Date(card.nextReviewDate).toISOString()},
         ${card.lastReviewDate ? new Date(card.lastReviewDate).toISOString() : null},
         ${card.status})
      `);

      await sql`
        INSERT INTO cards (
          id,
          set_id,
          front,
          back,
          example,
          image_url,
          audio_url,
          created_at,
          next_review,
          last_reviewed,
          status
        )
        VALUES ${sql.join(values, sql`, `)}
        ON CONFLICT (id) DO NOTHING
      `;

      // Обновляем total_cards по каждому набору
      const countsBySet: Record<string, number> = {};
      for (const card of cards) {
        countsBySet[card.setId] = (countsBySet[card.setId] || 0) + 1;
      }

      for (const [setId, count] of Object.entries(countsBySet)) {
        await sql`
          UPDATE card_sets
          SET total_cards = total_cards + ${count}
          WHERE id = ${setId}
        `;
      }

      return true;
    } catch (error) {
      console.error('Failed to create cards batch in Neon:', error);
      return false;
    }
  },

  /**
   * Удалить набор карточек
   */
  async deleteSet(setId: string): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        console.warn('POSTGRES_URL не настроен, пропускаем удаление набора');
        return false;
      }

      const sql = neon(connectionString);

      // Сначала удаляем все карточки набора
      await sql`DELETE FROM cards WHERE set_id = ${setId}`;

      // Потом удаляем сам набор
      await sql`DELETE FROM card_sets WHERE id = ${setId}`;

      console.log('✅ Набор и его карточки удалены из Neon:', setId);
      return true;
    } catch (error) {
      console.error('Failed to delete set from Neon:', error);
      return false;
    }
  },

  /**
   * Удалить карточку
   */
  async deleteCard(cardId: string): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        console.warn('POSTGRES_URL не настроен, пропускаем удаление карточки');
        return false;
      }

      const sql = neon(connectionString);

      await sql`DELETE FROM cards WHERE id = ${cardId}`;

      return true;
    } catch (error) {
      console.error('Failed to delete card from Neon:', error);
      return false;
    }
  },
};

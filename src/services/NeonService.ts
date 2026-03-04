/**
 * API Service для работы с Neon PostgreSQL
 * @description Сервис для загрузки данных из базы данных
 */

import { neon } from '@neondatabase/serverless';
import type { Card, CardSet, CardStatus, UpdateCardInput, Course } from '@/types';

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

type EnsureUserArgs = {
  id: string;
  email?: string | null;
  displayName?: string | null;
};

/**
 * Безопасно извлечь YYYY-MM-DD из PostgreSQL DATE.
 * Используем локальные геттеры, т.к. драйвер может вернуть Date в local midnight,
 * и toISOString() сдвинет дату назад при положительном UTC-offset.
 */
function pgDateToString(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).split('T')[0];
}

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
   * Гарантировать наличие пользователя в таблице users (идемпотентно).
   */
  async ensureUserExists(user: EnsureUserArgs): Promise<void> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        console.warn('POSTGRES_URL не настроен, пропускаем ensureUserExists');
        return;
      }
      const sql = neon(connectionString);
      const displayName =
        user.displayName ||
        (user.email ? user.email.split('@')[0] : null);

      const defaultUserName = user.email
        ? '@' + user.email.split('@')[0].toLowerCase()
        : null;

      await sql`
        INSERT INTO users (id, email, display_name, is_anonymous, user_name)
        VALUES (${user.id}::uuid, ${user.email}, ${displayName}, false, ${defaultUserName})
        ON CONFLICT (id) DO UPDATE SET
          user_name = COALESCE(users.user_name, EXCLUDED.user_name);
      `;
    } catch (error) {
      console.error('Failed to ensure user exists:', error);
    }
  },

  /**
   * Получить user_name пользователя
   */
  async getUserName(userId: string): Promise<string | null> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return null;
      const sql = neon(connectionString);
      const rows = await sql`
        SELECT user_name FROM users WHERE id = ${userId}::uuid
      `;
      return rows[0]?.user_name ?? null;
    } catch (error) {
      console.error('Failed to get user_name:', error);
      return null;
    }
  },

  /**
   * Получить display_name пользователя
   */
  async getDisplayName(userId: string): Promise<string | null> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return null;
      const sql = neon(connectionString);
      const rows = await sql`
        SELECT display_name FROM users WHERE id = ${userId}::uuid
      `;
      return rows[0]?.display_name ?? null;
    } catch (error) {
      console.error('Failed to get display_name:', error);
      return null;
    }
  },

  /**
   * Обновить display_name пользователя
   */
  async updateDisplayName(userId: string, displayName: string): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return false;
      const sql = neon(connectionString);
      await sql`
        UPDATE users SET display_name = ${displayName} WHERE id = ${userId}::uuid
      `;
      return true;
    } catch (error) {
      console.error('Failed to update display_name:', error);
      return false;
    }
  },

  /**
   * Обновить user_name пользователя
   */
  async updateUserName(userId: string, userName: string): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return false;
      const sql = neon(connectionString);

      const normalized = userName.startsWith('@') ? userName.toLowerCase() : '@' + userName.toLowerCase();

      await sql`
        UPDATE users SET user_name = ${normalized} WHERE id = ${userId}::uuid
      `;
      return true;
    } catch (error) {
      console.error('Failed to update user_name:', error);
      return false;
    }
  },

  /**
   * Загрузить все наборы карточек
   */
  async loadSets(userId?: string): Promise<CardSet[]> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        console.warn('POSTGRES_URL не настроен');
        return [];
      }

      if (!userId) {
        console.warn('userId не передан, пропускаем загрузку наборов');
        return [];
      }

      const sql = neon(connectionString);
      
      const sets = await sql`
        SELECT 
          id,
          user_id,
          course_id,
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
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `;

      return sets.map(set => ({
        id: set.id,
        userId: set.user_id,
        courseId: set.course_id || null,
        title: set.title,
        description: set.description || '',
        category: set.category || 'Общие',
        tags: [],
        languageFrom: set.language_from || 'de',
        languageTo: set.language_to || 'ru',
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
  async loadAllCards(userId?: string): Promise<Card[]> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        console.warn('POSTGRES_URL не настроен');
        return [];
      }

      if (!userId) {
        console.warn('userId не передан, пропускаем загрузку карточек');
        return [];
      }

      const sql = neon(connectionString);
      
      const cards = await sql`
        SELECT 
          c.id,
          c.set_id,
          c.front,
          c.back,
          c.example,
          c.image_url,
          c.audio_url,
          c.created_at,
          c.learning_step,
          c.next_review,
          c.last_reviewed,
          c.status
        FROM cards c
        INNER JOIN card_sets s ON c.set_id = s.id
        WHERE s.user_id = ${userId}
        ORDER BY c.created_at ASC
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
   * Обновить содержимое карточки (текст, медиа)
   */
  async updateCard(cardId: string, data: UpdateCardInput): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        console.warn('POSTGRES_URL не настроен, пропускаем обновление карточки');
        return false;
      }

      const sql = neon(connectionString);

      await sql`
        UPDATE cards
        SET
          front = COALESCE(${data.frontText ?? null}, front),
          back = COALESCE(${data.backText ?? null}, back),
          example = COALESCE(${data.example ?? null}, example),
          image_url = COALESCE(${data.frontImage ?? null}, image_url),
          audio_url = COALESCE(${data.frontAudio ?? null}, audio_url)
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
    courseId?: string | null;
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
          course_id,
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
          ${payload.courseId ?? null},
          ${payload.title},
          ${payload.description || null},
          ${payload.category || 'custom'},
          ${payload.languageFrom || null},
          ${payload.languageTo || null},
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

  // ==============================================
  // COURSES API
  // ==============================================

  /**
   * Загрузить все курсы пользователя
   */
  async loadCourses(userId?: string): Promise<Array<{
    id: string;
    title: string;
    createdAt: number;
    updatedAt?: number;
  }>> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString || !userId) {
        return [];
      }

      const sql = neon(connectionString);
      
      const courses = await sql`
        SELECT 
          id,
          title,
          created_at,
          updated_at
        FROM courses
        WHERE user_id = ${userId}
        ORDER BY created_at ASC
      `;

      return courses.map(course => ({
        id: course.id,
        title: course.title,
        createdAt: new Date(course.created_at).getTime(),
        updatedAt: course.updated_at ? new Date(course.updated_at).getTime() : undefined,
      }));
    } catch (error) {
      console.error('Failed to load courses:', error);
      return [];
    }
  },

  /**
   * Создать курс
   */
  async createCourse(course: {
    id: string;
    userId: string;
    title: string;
    createdAt: number;
  }): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        return false;
      }

      const sql = neon(connectionString);
      
      await sql`
        INSERT INTO courses (id, user_id, title, created_at, updated_at)
        VALUES (
          ${course.id}::uuid,
          ${course.userId}::uuid,
          ${course.title},
          ${new Date(course.createdAt).toISOString()},
          ${new Date(course.createdAt).toISOString()}
        )
      `;

      console.log('✅ Курс создан в Neon:', course.title);
      return true;
    } catch (error) {
      console.error('Failed to create course in Neon:', error);
      return false;
    }
  },

  /**
   * Переименовать курс
   */
  async renameCourse(courseId: string, title: string): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        return false;
      }

      const sql = neon(connectionString);
      
      await sql`
        UPDATE courses
        SET title = ${title}, updated_at = NOW()
        WHERE id = ${courseId}
      `;

      console.log('✅ Курс переименован в Neon:', title);
      return true;
    } catch (error) {
      console.error('Failed to rename course in Neon:', error);
      return false;
    }
  },

  /**
   * Удалить курс
   */
  async deleteCourse(courseId: string): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        return false;
      }

      const sql = neon(connectionString);
      
      // При удалении курса, наборы автоматически получат course_id = NULL
      // благодаря ON DELETE SET NULL в миграции
      await sql`DELETE FROM courses WHERE id = ${courseId}`;

      console.log('✅ Курс удален из Neon:', courseId);
      return true;
    } catch (error) {
      console.error('Failed to delete course from Neon:', error);
      return false;
    }
  },

  /**
   * Обновить course_id у набора
   */
  async updateSetCourse(setId: string, courseId: string | null): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        return false;
      }

      const sql = neon(connectionString);
      
      // Используем разные запросы для null и не-null значений
      if (courseId) {
        await sql`
          UPDATE card_sets
          SET course_id = ${courseId}::uuid, updated_at = NOW()
          WHERE id = ${setId}::uuid
        `;
      } else {
        await sql`
          UPDATE card_sets
          SET course_id = NULL, updated_at = NOW()
          WHERE id = ${setId}::uuid
        `;
      }

      console.log('✅ SQL UPDATE выполнен для card_sets:', { setId, courseId });
      return true;
    } catch (error) {
      console.error('Failed to update set course in Neon:', error);
      return false;
    }
  },

  // ==================== STREAK SYSTEM ====================

  /**
   * Upsert запись в daily_activity
   */
  async upsertDailyActivity(
    userId: string,
    localDate: string,
    deltas: { wordsDelta: number; minutesDelta: number; cardsDelta: number }
  ): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        return false;
      }

      const sql = neon(connectionString);
      
      // Используем INSERT ... ON CONFLICT для атомарного upsert
      await sql`
        INSERT INTO daily_activity (user_id, local_date, words_learned, minutes_learned, cards_studied)
        VALUES (
          ${userId}::uuid,
          ${localDate}::date,
          ${deltas.wordsDelta},
          ${deltas.minutesDelta},
          ${deltas.cardsDelta}
        )
        ON CONFLICT (user_id, local_date) DO UPDATE SET
          words_learned = daily_activity.words_learned + ${deltas.wordsDelta},
          minutes_learned = daily_activity.minutes_learned + ${deltas.minutesDelta},
          cards_studied = daily_activity.cards_studied + ${deltas.cardsDelta},
          updated_at = NOW()
      `;

      console.log('✅ Streak: daily_activity upserted', { userId, localDate, deltas });
      return true;
    } catch (error) {
      console.error('Failed to upsert daily_activity in Neon:', error);
      return false;
    }
  },

  /**
   * Обновить user_stats с расчётом стрика
   */
  async updateUserStatsStreak(
    userId: string,
    localDate: string,
    yesterdayDate: string,
    deltas: { wordsDelta: number; minutesDelta: number; cardsDelta: number }
  ): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        return false;
      }

      const sql = neon(connectionString);

      // Получаем текущую статистику пользователя
      const existing = await sql`
        SELECT current_streak, longest_streak, last_active_date
        FROM user_stats
        WHERE user_id = ${userId}::uuid
      `;

      let currentStreak = 0;
      let longestStreak = 0;
      let lastActiveDate: string | null = null;

      if (existing.length > 0) {
        currentStreak = existing[0].current_streak || 0;
        longestStreak = existing[0].longest_streak || 0;
        const rawDate = existing[0].last_active_date;
        if (rawDate) {
          lastActiveDate = pgDateToString(rawDate);
        }
      }

      console.log('🔍 Streak calc:', { lastActiveDate, localDate, yesterdayDate, currentStreak });

      // Рассчитываем новый стрик
      if (lastActiveDate === localDate) {
        // Уже записали сегодня - стрик не меняется
        console.log('ℹ️ Streak: уже записано сегодня, стрик не меняется');
      } else if (lastActiveDate === yesterdayDate) {
        // Учились вчера - продолжаем серию
        currentStreak += 1;
        console.log('✅ Streak: продолжаем серию', { currentStreak });
      } else {
        // Пропустили день(и) - начинаем заново
        currentStreak = 1;
        console.log('🔄 Streak: начинаем серию заново', { currentStreak });
      }

      // Обновляем longest_streak если нужно
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }

      // Upsert user_stats
      await sql`
        INSERT INTO user_stats (user_id, current_streak, longest_streak, last_active_date, total_words_learned, total_minutes_learned, total_cards_studied)
        VALUES (
          ${userId}::uuid,
          ${currentStreak},
          ${longestStreak},
          ${localDate}::date,
          ${deltas.wordsDelta},
          ${deltas.minutesDelta},
          ${deltas.cardsDelta}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          current_streak = ${currentStreak},
          longest_streak = ${longestStreak},
          last_active_date = ${localDate}::date,
          total_words_learned = user_stats.total_words_learned + ${deltas.wordsDelta},
          total_minutes_learned = user_stats.total_minutes_learned + ${deltas.minutesDelta},
          total_cards_studied = user_stats.total_cards_studied + ${deltas.cardsDelta},
          updated_at = NOW()
      `;

      console.log('✅ Streak: user_stats updated', { userId, currentStreak, longestStreak, localDate });
      return true;
    } catch (error) {
      console.error('Failed to update user_stats in Neon:', error);
      return false;
    }
  },

  /**
   * Получить активность за последние N дней
   */
  async getWeekActivity(userId: string, days: number = 7): Promise<{
    local_date: string;
    words_learned: number;
    minutes_learned: number;
    cards_studied: number;
  }[]> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        return [];
      }

      const sql = neon(connectionString);

      const result = await sql`
        SELECT local_date, words_learned, minutes_learned, cards_studied
        FROM daily_activity
        WHERE user_id = ${userId}::uuid
          AND local_date >= CURRENT_DATE - ${days}::int
        ORDER BY local_date DESC
      `;

      return result.map((row: any) => ({
        local_date: pgDateToString(row.local_date),
        words_learned: row.words_learned || 0,
        minutes_learned: row.minutes_learned || 0,
        cards_studied: row.cards_studied || 0,
      }));
    } catch (error) {
      console.error('Failed to get week activity from Neon:', error);
      return [];
    }
  },

  /**
   * Получить статистику пользователя
   */
  async getUserStats(userId: string): Promise<{
    current_streak: number;
    longest_streak: number;
    last_active_date: string | null;
    timezone: string;
    total_words_learned: number;
    total_minutes_learned: number;
    total_cards_studied: number;
  } | null> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        return null;
      }

      const sql = neon(connectionString);

      const result = await sql`
        SELECT current_streak, longest_streak, last_active_date, timezone,
               total_words_learned, total_minutes_learned, total_cards_studied
        FROM user_stats
        WHERE user_id = ${userId}::uuid
      `;

      if (result.length === 0) {
        return null;
      }

      const row = result[0];
      const lastActiveDate = row.last_active_date
        ? pgDateToString(row.last_active_date)
        : null;
      let currentStreak = row.current_streak || 0;
      const longestStreak = row.longest_streak || 0;

      // Определяем таймзон: из БД или системный
      let timezone: string;
      try {
        timezone = row.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        timezone = 'UTC';
      }

      // Серверная проверка сброса стрика: если пропущено > 1 дня — обнуляем
      if (lastActiveDate && currentStreak > 0) {
        try {
          const todayKey = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date());

          const lastDate = new Date(lastActiveDate + 'T12:00:00Z');
          const todayDate = new Date(todayKey + 'T12:00:00Z');
          const diffDays = Math.round(
            (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (diffDays > 1) {
            currentStreak = 0;
            await sql`
              UPDATE user_stats SET current_streak = 0, updated_at = NOW()
              WHERE user_id = ${userId}::uuid
            `;
            console.log(`🔄 Streak: сброс на сервере — пропущено ${diffDays} дней`);
          }
        } catch (e) {
          console.warn('⚠️ Streak: ошибка при проверке сброса стрика', e);
        }
      }

      return {
        current_streak: currentStreak,
        longest_streak: longestStreak,
        last_active_date: lastActiveDate,
        timezone,
        total_words_learned: row.total_words_learned || 0,
        total_minutes_learned: row.total_minutes_learned || 0,
        total_cards_studied: row.total_cards_studied || 0,
      };
    } catch (error) {
      console.error('Failed to get user stats from Neon:', error);
      return null;
    }
  },

  /**
   * Получить активность за конкретную дату
   */
  async getDailyActivity(userId: string, localDate: string): Promise<{
    local_date: string;
    words_learned: number;
    minutes_learned: number;
    cards_studied: number;
  } | null> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) {
        return null;
      }

      const sql = neon(connectionString);

      const result = await sql`
        SELECT local_date, words_learned, minutes_learned, cards_studied
        FROM daily_activity
        WHERE user_id = ${userId}::uuid AND local_date = ${localDate}::date
      `;

      if (result.length === 0) {
        return null;
      }

      const row = result[0];
      return {
        local_date: pgDateToString(row.local_date),
        words_learned: row.words_learned || 0,
        minutes_learned: row.minutes_learned || 0,
        cards_studied: row.cards_studied || 0,
      };
    } catch (error) {
      console.error('Failed to get daily activity from Neon:', error);
      return null;
    }
  },
};

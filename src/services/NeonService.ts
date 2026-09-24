/**
 * API Service для работы с Neon PostgreSQL
 * @description Сервис для загрузки данных из базы данных
 */

import { neon } from '@neondatabase/serverless';
import { supabase } from './supabaseClient';
import { API_BASE } from '@/config/apiBase';
import type { Card, CardSet, CardStatus, UpdateCardInput, Course } from '@/types';

// Учительские мутации (курсы/инвайты/ростер/видимость наборов) идут через настоящий backend
// (api/teacher.js), а не напрямую в Neon — он проверяет Supabase JWT вызывающего вместо того,
// чтобы доверять userId, переданному с клиента. См. plan/teacher_access_fix_plan.md, пункт 1.
const TEACHER_API_BASE = `${API_BASE}/teacher`;

// Причина отказа — чтобы UI мог показать разный текст под "истёк"/"не найден"/"нет сети" и
// т.д., вместо одного и того же сообщения на всё подряд (план, пункт 13).
export type TeacherApiReason =
  | 'not_found' | 'expired' | 'own_course' | 'unauthorized' | 'forbidden'
  | 'rate_limited' | 'bad_request' | 'network' | 'unknown';

function reasonFromStatus(status: number): TeacherApiReason {
  switch (status) {
    case 401: return 'unauthorized';
    case 403: return 'forbidden';
    case 404: return 'not_found';
    case 410: return 'expired';
    case 429: return 'rate_limited';
    case 400: return 'bad_request';
    default: return 'unknown';
  }
}

async function callTeacherApi<T = any>(
  action: string,
  { method = 'GET', body, params }: { method?: 'GET' | 'POST'; body?: Record<string, any>; params?: Record<string, string> } = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number; reason: TeacherApiReason }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: 'Not authenticated', status: 401, reason: 'unauthorized' };

  const query = new URLSearchParams({ action, ...(params || {}) }).toString();
  try {
    const resp = await fetch(`${TEACHER_API_BASE}?${query}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const reason: TeacherApiReason = json?.reason || reasonFromStatus(resp.status);
      return { ok: false, error: json?.error || `HTTP ${resp.status}`, status: resp.status, reason };
    }
    return { ok: true, data: json as T };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Network error', status: 0, reason: 'network' };
  }
}

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
  isAnonymous?: boolean; // Guest login
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
        VALUES (${user.id}::uuid, ${user.email ?? null}, ${displayName ?? 'Гость'}, ${user.isAnonymous ?? false}, ${defaultUserName ?? null})
        ON CONFLICT (id) DO UPDATE SET
          user_name = COALESCE(users.user_name, EXCLUDED.user_name);
      `;
    } catch (error) {
      console.error('Failed to ensure user exists:', error);
    }
  },

  /**
   * Проверить, является ли пользователь учителем
   */
  async getIsTeacher(userId: string): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return false;
      const sql = neon(connectionString);
      const rows = await sql`
        SELECT teacher FROM users WHERE id = ${userId}::uuid
      `;
      return rows[0]?.teacher === true;
    } catch (error) {
      console.error('Failed to get teacher status:', error);
      return false;
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
   * Получить родной язык и изучаемые языки пользователя
   */
  async getLanguagePreferences(
    userId: string,
  ): Promise<{ nativeLanguage: string | null; targetLanguages: string[] }> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return { nativeLanguage: null, targetLanguages: [] };
      const sql = neon(connectionString);
      const rows = await sql`
        SELECT native_language, target_languages FROM users WHERE id = ${userId}::uuid
      `;
      return {
        nativeLanguage: rows[0]?.native_language ?? null,
        targetLanguages: rows[0]?.target_languages ?? [],
      };
    } catch (error) {
      console.error('Failed to get language preferences:', error);
      return { nativeLanguage: null, targetLanguages: [] };
    }
  },

  /**
   * Обновить родной язык и/или изучаемые языки пользователя
   */
  async updateLanguagePreferences(
    userId: string,
    data: { nativeLanguage?: string; targetLanguages?: string[] },
  ): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return false;
      const sql = neon(connectionString);
      await sql`
        UPDATE users SET
          native_language = COALESCE(${data.nativeLanguage ?? null}, native_language),
          target_languages = COALESCE(${data.targetLanguages ?? null}, target_languages)
        WHERE id = ${userId}::uuid
      `;
      return true;
    } catch (error) {
      console.error('Failed to update language preferences:', error);
      return false;
    }
  },

  /**
   * Добавить алмазы пользователю (increment)
   */
  async addDiamonds(userId: string, amount: number): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return false;
      const sql = neon(connectionString);

      await sql`
        UPDATE users SET diamond = COALESCE(diamond, 0) + ${amount} WHERE id = ${userId}::uuid
      `;
      return true;
    } catch (error) {
      console.error('Failed to add diamonds:', error);
      return false;
    }
  },

  /**
   * Проверить, завершил ли пользователь онбординг
   */
  async checkOnboardingCompleted(userId: string): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return true;
      const sql = neon(connectionString);
      const rows = await sql`
        SELECT onboarding_completed FROM users WHERE id = ${userId}::uuid
      `;
      if (rows.length === 0) return true;
      return rows[0]?.onboarding_completed === true;
    } catch (error) {
      console.error('Failed to check onboarding status:', error);
      return true;
    }
  },

  /**
   * Сохранить данные онбординга и отметить онбординг завершённым
   */
  async saveOnboardingData(
    userId: string,
    data: {
      displayName?: string;
      teacher?: boolean;
      nativeLanguage?: string;
      targetLanguages?: string[];
      learningGoal?: string;
      dailyGoal?: string;
      teacherSubject?: string;
      teacherGroupSize?: string;
    },
  ): Promise<void> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return;
      const sql = neon(connectionString);
      await sql`
        UPDATE users SET
          display_name = COALESCE(${data.displayName ?? null}, display_name),
          teacher = COALESCE(${data.teacher ?? null}, teacher),
          native_language = COALESCE(${data.nativeLanguage ?? null}, native_language),
          target_languages = COALESCE(${data.targetLanguages ?? null}, target_languages),
          learning_goal = COALESCE(${data.learningGoal ?? null}, learning_goal),
          daily_goal = COALESCE(${data.dailyGoal ?? null}, daily_goal),
          teacher_subject = COALESCE(${data.teacherSubject ?? null}, teacher_subject),
          teacher_group_size = COALESCE(${data.teacherGroupSize ?? null}, teacher_group_size),
          onboarding_completed = true
        WHERE id = ${userId}::uuid
      `;
    } catch (error) {
      console.error('Failed to save onboarding data:', error);
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
          studying_cards,
          is_hidden_from_students
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
        isHiddenFromStudents: set.is_hidden_from_students === true,
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
          word_form,
          word_type,
          image_url,
          audio_url,
          created_at,
          learning_step,
          next_review,
          last_reviewed,
          status
        FROM cards
        WHERE set_id = ${setId}
        -- sort_order задан только у карточек официальных наборов (порядок из Excel);
        -- у обычных он NULL, и порядок остаётся по created_at, как раньше.
        ORDER BY sort_order NULLS LAST, created_at ASC
      `;

      return cards.map(card => ({
        id: card.id,
        setId: card.set_id,
        frontText: card.front,
        backText: card.back,
        example: card.example || '',
        wordForm: card.word_form || undefined,
        wordType: card.word_type || undefined,
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

      // Миграция: добавить word_type и word_form если ещё нет (идемпотентна)
      try {
        await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS word_type VARCHAR(20)`;
        await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS word_form VARCHAR(100)`;
      } catch {}

      const cards = await sql`
        SELECT
          c.id,
          c.set_id,
          c.front,
          c.back,
          c.example,
          c.word_form,
          c.word_type,
          c.image_url,
          c.audio_url,
          c.created_at,
          CASE
            WHEN s.user_id = ${userId} THEN COALESCE(cp.learning_step, c.learning_step)
            ELSE COALESCE(cp.learning_step, 0)
          END AS learning_step,
          CASE
            WHEN s.user_id = ${userId} THEN COALESCE(cp.next_review, c.next_review)
            ELSE COALESCE(cp.next_review, NOW())
          END AS next_review,
          CASE
            WHEN s.user_id = ${userId} THEN COALESCE(cp.last_reviewed, c.last_reviewed)
            ELSE cp.last_reviewed
          END AS last_reviewed,
          CASE
            WHEN s.user_id = ${userId} THEN COALESCE(cp.status, c.status)
            ELSE COALESCE(cp.status, 'new')
          END AS status
        FROM cards c
        INNER JOIN card_sets s ON c.set_id = s.id
        LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = ${userId}::uuid
        WHERE s.user_id = ${userId}
          OR s.course_id IN (
            SELECT course_id FROM course_members
            WHERE user_id = ${userId} AND role = 'student'
          )
        -- sort_order — порядок карточек, вставленных одним запросом (импорт из библиотеки, копия
        -- юнита): у них одинаковый created_at. У остальных карточек он NULL и ничего не меняет.
        ORDER BY c.created_at ASC, c.sort_order NULLS LAST
      `;

      return cards.map(card => ({
        id: card.id,
        setId: card.set_id,
        frontText: card.front,
        backText: card.back,
        example: card.example || '',
        wordForm: card.word_form || undefined,
        wordType: card.word_type || undefined,
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
          word_form = COALESCE(${data.wordForm ?? null}, word_form),
          word_type = COALESCE(${data.wordType ?? null}, word_type),
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
          word_type,
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
          ${card.wordType || null},
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

      for (const card of cards) {
        await sql`
          INSERT INTO cards (
            id,
            set_id,
            front,
            back,
            example,
            word_type,
            image_url,
            audio_url,
            created_at,
            next_review,
            last_reviewed,
            status
          )
          VALUES (
            ${card.id},
            ${card.setId},
            ${card.frontText},
            ${card.backText},
            ${card.example || null},
            ${card.wordType || null},
            ${card.frontImage || null},
            ${card.frontAudio || null},
            ${new Date(card.createdAt).toISOString()},
            ${new Date(card.nextReviewDate).toISOString()},
            ${card.lastReviewDate ? new Date(card.lastReviewDate).toISOString() : null},
            ${card.status}
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }

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
    const result = await callTeacherApi('rename-course', { method: 'POST', body: { courseId, title } });
    if (!result.ok) {
      console.error('Failed to rename course:', result.error);
      return false;
    }
    return true;
  },

  /**
   * Удалить курс
   */
  async deleteCourse(courseId: string): Promise<boolean> {
    const result = await callTeacherApi('delete-course', { method: 'POST', body: { courseId } });
    if (!result.ok) {
      console.error('Failed to delete course:', result.error);
      return false;
    }
    return true;
  },

  /**
   * Обновить мета-данные набора (title, description, category, languageFrom, languageTo)
   */
  async updateSetMeta(setId: string, fields: {
    title?: string;
    description?: string;
    category?: string;
    languageFrom?: string;
    languageTo?: string;
  }): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return false;

      const sql = neon(connectionString);
      await sql`
        UPDATE card_sets
        SET
          title        = COALESCE(${fields.title ?? null}, title),
          description  = COALESCE(${fields.description ?? null}, description),
          category     = COALESCE(${fields.category ?? null}, category),
          language_from = COALESCE(${fields.languageFrom ?? null}, language_from),
          language_to  = COALESCE(${fields.languageTo ?? null}, language_to),
          updated_at   = NOW()
        WHERE id = ${setId}::uuid
      `;
      console.log('✅ updateSetMeta выполнен:', { setId, fields });
      return true;
    } catch (error) {
      console.error('Failed to updateSetMeta in Neon:', error);
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
        fetch(`${API_BASE}/push?action=notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (process.env.EXPO_PUBLIC_NOTIFY_SECRET || ''),
          },
          body: JSON.stringify({
            userId,
            type: 'streak_lost',
            data: { prevStreak: existing[0].current_streak },
          }),
        }).catch(() => {});
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
   * Записать событие получения/продления стрика (для админ-панели)
   */
  async logStreakEvent(userId: string, streakDay: number): Promise<void> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return;
      const sql = neon(connectionString);
      await sql`
        INSERT INTO streak_events (user_id, streak_day)
        VALUES (${userId}::uuid, ${streakDay})
      `;
    } catch (error) {
      console.warn('logStreakEvent failed:', error);
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

  // ==================== COURSE INVITES ====================

  /**
   * Создать или получить существующий инвайт-токен для курса
   */
  async createCourseInvite(courseId: string, _userId: string): Promise<{ token: string; joinCode: string } | null> {
    // _userId сохранён для обратной совместимости сигнатуры вызывающего кода — реальный
    // владелец теперь определяется backend'ом из Supabase JWT, а не из этого параметра.
    const result = await callTeacherApi<{ token: string; joinCode: string }>('create-invite', {
      method: 'POST',
      body: { courseId },
    });
    if (!result.ok) {
      console.error('Failed to create course invite:', result.error);
      return null;
    }
    return { token: result.data.token, joinCode: result.data.joinCode };
  },

  /**
   * Пересоздать инвайт курса — старые token/join_code сразу перестают работать.
   * Использовать, если старая ссылка/код могли утечь не в те руки.
   */
  async regenerateCourseInvite(courseId: string): Promise<{ token: string; joinCode: string } | null> {
    const result = await callTeacherApi<{ token: string; joinCode: string }>('regenerate-invite', {
      method: 'POST',
      body: { courseId },
    });
    if (!result.ok) {
      console.error('Failed to regenerate course invite:', result.error);
      return null;
    }
    return { token: result.data.token, joinCode: result.data.joinCode };
  },

  /**
   * Получить информацию о курсе по короткому коду (для ученика)
   */
  async getCourseInviteInfoByCode(code: string): Promise<
    | { ok: true; courseId: string; courseTitle: string; teacherName: string }
    | { ok: false; reason: TeacherApiReason }
  > {
    const result = await callTeacherApi<{ courseId: string; courseTitle: string; teacherName: string }>(
      'invite-info-by-code',
      { method: 'GET', params: { code } },
    );
    if (!result.ok) {
      if (result.reason !== 'not_found' && result.reason !== 'expired') {
        console.error('Failed to get course invite info by code:', result.error);
      }
      return { ok: false, reason: result.reason };
    }
    return { ok: true, courseId: result.data.courseId, courseTitle: result.data.courseTitle, teacherName: result.data.teacherName };
  },

  /**
   * Присоединиться к курсу по короткому коду
   */
  async joinCourseByCode(code: string, _userId: string): Promise<
    | { ok: true; courseId: string; courseTitle: string }
    | { ok: false; reason: TeacherApiReason }
  > {
    // _userId сохранён для обратной совместимости — backend берёт userId из JWT.
    const result = await callTeacherApi<{ courseId: string; courseTitle: string }>('join-by-code', {
      method: 'POST',
      body: { code },
    });
    if (!result.ok) {
      if (result.reason !== 'not_found' && result.reason !== 'expired' && result.reason !== 'own_course') {
        console.warn('Failed to join course by code:', result.error);
      }
      return { ok: false, reason: result.reason };
    }
    return { ok: true, courseId: result.data.courseId, courseTitle: result.data.courseTitle };
  },

  /**
   * Получить информацию о курсе по токену (для модалки у ученика)
   */
  async getCourseInviteInfo(token: string): Promise<
    | { ok: true; courseId: string; courseTitle: string; teacherName: string }
    | { ok: false; reason: TeacherApiReason }
  > {
    const result = await callTeacherApi<{ courseId: string; courseTitle: string; teacherName: string }>(
      'invite-info-by-token',
      { method: 'GET', params: { token } },
    );
    if (!result.ok) {
      if (result.reason !== 'not_found' && result.reason !== 'expired') {
        console.error('Failed to get course invite info:', result.error);
      }
      return { ok: false, reason: result.reason };
    }
    return { ok: true, courseId: result.data.courseId, courseTitle: result.data.courseTitle, teacherName: result.data.teacherName };
  },

  /**
   * Принять приглашение — добавить ученика в course_members
   */
  async joinCourseByToken(token: string, _userId: string): Promise<
    | { ok: true; courseId: string; courseTitle: string }
    | { ok: false; reason: TeacherApiReason }
  > {
    // _userId сохранён для обратной совместимости — backend берёт userId из JWT.
    const result = await callTeacherApi<{ courseId: string; courseTitle: string }>('join-by-token', {
      method: 'POST',
      body: { token },
    });
    if (!result.ok) {
      if (result.reason !== 'not_found' && result.reason !== 'expired' && result.reason !== 'own_course') {
        console.warn('Failed to join course by token:', result.error);
      }
      return { ok: false, reason: result.reason };
    }
    return { ok: true, courseId: result.data.courseId, courseTitle: result.data.courseTitle };
  },

  async removeStudentFromCourse(courseId: string, studentUserId: string, _teacherUserId: string): Promise<boolean> {
    // _teacherUserId сохранён для обратной совместимости — backend берёт userId из JWT.
    const result = await callTeacherApi('remove-student', { method: 'POST', body: { courseId, studentUserId } });
    if (!result.ok) {
      console.error('Failed to remove student from course:', result.error);
      return false;
    }
    return true;
  },

  /**
   * Загрузить курсы где пользователь — ученик
   */
  async loadStudentCourses(userId: string): Promise<Course[]> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return [];

      const sql = neon(connectionString);

      const rows = await sql`
        SELECT
          c.id,
          c.title,
          c.user_id AS owner_id,
          cm.joined_at,
          COALESCE(u.display_name, u.user_name, u.email) AS teacher_name
        FROM course_members cm
        JOIN courses c ON c.id = cm.course_id
        JOIN users u ON u.id = c.user_id
        WHERE cm.user_id = ${userId}::uuid AND cm.role = 'student'
        ORDER BY cm.joined_at DESC
      `;

      return rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        createdAt: new Date(row.joined_at).getTime(),
        isStudentCourse: true,
        teacherName: row.teacher_name,
        ownerId: row.owner_id,
      }));
    } catch (error) {
      console.error('Failed to load student courses:', error);
      return [];
    }
  },

  /**
   * Загрузить наборы курса учителя (для ученика, read-only)
   */
  async loadCourseSetsByMembership(courseId: string): Promise<CardSet[]> {
    // Идёт через backend — раньше шло напрямую в Neon с клиента без проверки, что
    // вызывающий реально состоит в этом курсе (см. план, пункт 23).
    const result = await callTeacherApi<{
      sets: Array<{
        id: string; userId: string; title: string; description: string; category: string;
        icon: string | null; languageFrom: string; languageTo: string; totalCards: number;
        createdAt: string; updatedAt: string | null; courseId: string;
        isOfficial?: boolean; unitId?: string | null; bookId?: string | null;
        bookTitle?: string | null; unitNumber?: number | null;
      }>;
    }>('course-sets-by-membership', { method: 'GET', params: { courseId } });
    if (!result.ok) {
      console.error('Failed to load course sets by membership:', result.error);
      return [];
    }
    return result.data.sets.map((row) => ({
      id: row.id,
      userId: row.userId,
      title: row.title,
      description: row.description || '',
      category: row.category || '',
      icon: row.icon || null,
      languageFrom: row.languageFrom || 'de',
      languageTo: row.languageTo || 'ru',
      totalCards: row.totalCards || 0,
      createdAt: new Date(row.createdAt).getTime(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).getTime() : undefined,
      courseId: row.courseId,
      isReadOnly: true,
      ownerCourseId: courseId,
      isOfficial: row.isOfficial === true,
      unitId: row.unitId || undefined,
      bookId: row.bookId || undefined,
      bookTitle: row.bookTitle || undefined,
      unitNumber: row.unitNumber ?? undefined,
    }));
  },

  /**
   * Загрузить участников курса (для кабинета учителя)
   */
  async loadCourseMembers(courseId: string): Promise<Array<{
    id: string;
    displayName: string;
    email: string | null;
    streak: number;
    lastActiveDate: string | null;
    todayCards: number;
    joinedAt: number;
  }>> {
    type Member = {
      id: string; displayName: string; email: string | null;
      streak: number; lastActiveDate: string | null; todayCards: number; joinedAt: string;
    };
    const result = await callTeacherApi<{ members: Member[] }>('list-members', {
      method: 'GET',
      params: { courseId },
    });
    if (!result.ok) {
      console.error('Failed to load course members:', result.error);
      throw new Error(result.error);
    }
    return result.data.members.map((row) => ({
      id: row.id,
      displayName: row.displayName || 'Ученик',
      email: row.email || null,
      streak: row.streak || 0,
      lastActiveDate: row.lastActiveDate ? pgDateToString(row.lastActiveDate) : null,
      todayCards: Number(row.todayCards) || 0,
      joinedAt: new Date(row.joinedAt).getTime(),
    }));
  },

  async loadCourseActivityChart(
    courseId: string,
    days: number,
  ): Promise<Array<{ date: string; count: number }>> {
    // Идёт через backend — раньше шло напрямую в Neon с клиента без проверки владения
    // курсом (см. план, пункт 23).
    const result = await callTeacherApi<{ rows: Array<{ date: string; count: number }> }>(
      'course-activity-chart',
      { method: 'GET', params: { courseId, days: String(days) } },
    );
    if (!result.ok) {
      console.error('Failed to load course activity chart:', result.error);
      throw new Error(result.error);
    }
    return result.data.rows;
  },

  async saveReview(
    userId: string,
    cardId: string,
    quality: number,
    timeSpent: number,
  ): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return false;

      const sql = neon(connectionString);

      // idx_reviews_user_id/idx_reviews_user_card уже создаются один раз при инициализации
      // БД (api/_db-init.js) — раньше пересоздавались (CREATE INDEX IF NOT EXISTS) на каждый
      // вызов saveReview, то есть на каждый ответ на карточку в любой сессии. См. план, пункт 28.
      await sql`
        INSERT INTO reviews (card_id, user_id, quality, time_spent)
        VALUES (${cardId}::uuid, ${userId}::uuid, ${quality}, ${timeSpent})
      `;

      return true;
    } catch (error) {
      console.error('Failed to save review:', error);
      return false;
    }
  },

  async upsertCardProgress(
    userId: string,
    cardId: string,
    data: {
      status: string;
      learningStep: number;
      nextReview: number;
      lastReviewed: number;
    }
  ): Promise<boolean> {
    try {
      const connectionString = getConnectionString();
      if (!connectionString) return false;

      const sql = neon(connectionString);

      const nextReviewIso = data.nextReview ? new Date(data.nextReview).toISOString() : new Date().toISOString();
      const lastReviewedIso = data.lastReviewed ? new Date(data.lastReviewed).toISOString() : null;

      await sql`
        INSERT INTO card_progress (
          user_id, card_id, status, learning_step,
          next_review, last_reviewed, updated_at
        )
        VALUES (
          ${userId}::uuid, ${cardId}::uuid, ${data.status}, ${data.learningStep},
          ${nextReviewIso}::timestamptz, ${lastReviewedIso}::timestamptz, NOW()
        )
        ON CONFLICT (user_id, card_id) DO UPDATE SET
          status        = EXCLUDED.status,
          learning_step = EXCLUDED.learning_step,
          next_review   = EXCLUDED.next_review,
          last_reviewed = EXCLUDED.last_reviewed,
          updated_at    = NOW()
      `;

      return true;
    } catch (error) {
      console.error('Failed to upsert card progress:', error);
      return false;
    }
  },

  async loadCourseSetStats(courseId: string): Promise<Array<{
    setId: string;
    title: string;
    totalCards: number;
    studentsStarted: number;
    studentsCompleted: number;
    progressPct: number;
    // Юнит книги (каталог книг): есть в статистике, если учитель хоть раз его открывал
    isOfficial?: boolean;
    bookTitle?: string | null;
    unitNumber?: number | null;
    unitOpen?: boolean | null;
  }>> {
    // Идёт через backend — раньше шло напрямую в Neon с клиента без проверки владения
    // курсом (см. план, пункт 23).
    const result = await callTeacherApi<{
      sets: Array<{
        setId: string; title: string; totalCards: number;
        studentsStarted: number; studentsCompleted: number; progressPct: number;
        isOfficial?: boolean; bookTitle?: string | null; unitNumber?: number | null; unitOpen?: boolean | null;
      }>;
    }>('course-set-stats', { method: 'GET', params: { courseId } });
    if (!result.ok) {
      console.error('Failed to load course set stats:', result.error);
      throw new Error(result.error);
    }
    return result.data.sets;
  },

  async loadSetHardCards(setId: string, courseId: string): Promise<Array<{
    cardId: string;
    front: string;
    back: string;
    attempts: number;
  }>> {
    // Идёт через backend — раньше шло напрямую в Neon с клиента без проверки владения
    // курсом (см. план, пункт 23).
    const result = await callTeacherApi<{
      cards: Array<{ cardId: string; front: string; back: string; attempts: number }>;
    }>('set-hard-cards', { method: 'GET', params: { setId, courseId } });
    if (!result.ok) {
      console.error('Failed to load set hard cards:', result.error);
      return [];
    }
    return result.data.cards;
  },

  async isCourseOwner(courseId: string, _userId: string): Promise<boolean> {
    // _userId сохранён для обратной совместимости — backend берёт userId из JWT.
    const result = await callTeacherApi<{ isOwner: boolean }>('check-owner', {
      method: 'GET',
      params: { courseId },
    });
    if (!result.ok) {
      console.error('Failed to check course ownership:', result.error);
      return false;
    }
    return result.data.isOwner;
  },

  async leaveStudentCourse(courseId: string, _userId: string): Promise<boolean> {
    // _userId сохранён для обратной совместимости — backend берёт userId из JWT.
    const result = await callTeacherApi('leave-course', { method: 'POST', body: { courseId } });
    if (!result.ok) {
      console.warn('Failed to leave student course:', result.error);
      return false;
    }
    return true;
  },

  /**
   * Загрузить детальную статистику ученика по курсу (для карточки детального просмотра).
   * Возвращает прогресс по каждому набору и суммарные выученные/не выученные карточки.
   * "Выученная" карточка — learning_step >= 3 (young / mature).
   */
  async loadStudentCourseStats(courseId: string, studentId: string): Promise<{
    seenCards: number;
    learnedCards: number;
    unlearnedCards: number;
    sets: Array<{
      setId: string;
      title: string;
      totalCards: number;
      learnedCards: number;
      seenCards: number;
    }>;
    streak: number;
    lastActiveDate: string | null;
  }> {
    const result = await callTeacherApi<{
      seenCards: number; learnedCards: number; unlearnedCards: number;
      sets: Array<{ setId: string; title: string; totalCards: number; learnedCards: number; seenCards: number }>;
      streak: number; lastActiveDate: string | null;
    }>('student-stats', { method: 'GET', params: { courseId, studentId } });
    if (!result.ok) {
      console.error('Failed to load student course stats:', result.error);
      throw new Error(result.error);
    }
    return result.data;
  },

  async toggleSetHiddenFromStudents(setId: string, hidden: boolean): Promise<boolean> {
    const result = await callTeacherApi('toggle-set-hidden', { method: 'POST', body: { setId, hidden } });
    if (!result.ok) {
      console.error('Failed to toggle set hidden from students:', result.error);
      return false;
    }
    return true;
  },
};

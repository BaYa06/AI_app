/**
 * Сервис данных пользователя (наборы, карточки, курсы, прогресс, серия).
 * @description Все запросы идут через backend (api/data.js, api/teacher.js) с Supabase JWT —
 * строки подключения к БД в приложении нет. См. plan/course_rating_and_review_plan.md, этап 0.
 */

import { supabase } from './supabaseClient';
import { API_BASE } from '@/config/apiBase';
import { fetchWithTimeout } from '@/utils/fetchWithTimeout';
import { readCache, writeCache } from './localCache';
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
    const resp = await fetchWithTimeout(`${TEACHER_API_BASE}?${query}`, {
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

const DATA_API_BASE = `${API_BASE}/data`;

/**
 * Вызов api/data.js. userId сервер берёт из Supabase JWT — параметры userId у методов ниже
 * оставлены только ради совместимости сигнатур вызывающего кода.
 * Возвращает null, если нет сессии, сети или сервер ответил ошибкой.
 */
async function callDataApi<T = any>(
  action: string,
  params: Record<string, any> = {},
  method: 'GET' | 'POST' = 'POST',
  strict = false,
): Promise<T | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;
  try {
    const query = new URLSearchParams({ action });
    if (method === 'GET') {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) query.set(key, String(value));
      }
    }
    const resp = await fetchWithTimeout(`${DATA_API_BASE}?${query.toString()}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: method === 'POST' ? JSON.stringify(params) : undefined,
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error(`Data API ${action} failed:`, json?.error || resp.status);
      if (strict) throw new NetworkLoadError(action, resp.status);
      return null;
    }
    return json.data as T;
  } catch (error) {
    if (error instanceof NetworkLoadError) throw error;
    console.error(`Data API ${action} network error:`, error);
    if (strict) throw new NetworkLoadError(action);
    return null;
  }
}

export type CourseLeaderboard =
  | { enabled: false }
  | {
      enabled: boolean;
      isTeacher: boolean;
      week: 'current' | 'previous';
      weekStart: string;
      timezone: string;
      frozen: boolean;
      /** Конец текущей недели (мс); для прошлой недели — null */
      endsAt: number | null;
      /** Награда топ-3 в алмазах */
      rewards: number[];
      rows: Array<{ userId: string; name: string; points: number; place: number | null; reward: number; hidden: boolean; isMe: boolean }>;
      me: { place: number | null; points: number; hidden: boolean; gapToNext: number | null; learnedTotal: number | null } | null;
    };

/** Вызов api/progress.js (рейтинг курса). null — нет сессии, сети или ошибка сервера. */
async function callProgressApi<T = any>(
  action: string,
  { method, params, body }: { method: 'GET' | 'POST'; params?: Record<string, string>; body?: object },
): Promise<T | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;
  try {
    const query = new URLSearchParams({ action, ...(params || {}) });
    const resp = await fetchWithTimeout(`${API_BASE}/progress?${query.toString()}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error(`Progress API ${action} failed:`, json?.error || resp.status);
      return null;
    }
    return json as T;
  } catch (error) {
    console.error(`Progress API ${action} network error:`, error);
    return null;
  }
}

/** Загрузка на старте: сетевую ошибку не выдавать за «пусто», иначе сохранённые данные затрутся */
type LoadOptions = { throwOnError?: boolean };

/** Сервер не ответил (нет сети/таймаут/ошибка) — в отличие от пустого ответа */
export class NetworkLoadError extends Error {
  /** HTTP-код ответа; 0 — сеть/таймаут */
  status: number;
  constructor(what: string, status = 0) {
    super(`Network load failed: ${what}`);
    this.name = 'NetworkLoadError';
    this.status = status;
  }
}

type ProfileRow = {
  teacher: boolean | null;
  user_name: string | null;
  display_name: string | null;
  native_language: string | null;
  target_languages: string[] | null;
  onboarding_completed: boolean | null;
};

function mapCardRow(card: any): Card {
  return {
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
  } as Card;
}

function mapSetRow(set: any): CardSet {
  return {
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
  } as CardSet;
}

function mapCourseRow(course: any): { id: string; title: string; createdAt: number; updatedAt?: number } {
  return {
    id: course.id,
    title: course.title,
    createdAt: new Date(course.created_at).getTime(),
    updatedAt: course.updated_at ? new Date(course.updated_at).getTime() : undefined,
  };
}

function mapStudentCourseRow(row: any): Course {
  return {
    id: row.id,
    title: row.title,
    createdAt: new Date(row.joined_at).getTime(),
    isStudentCourse: true,
    teacherName: row.teacher_name,
    ownerId: row.owner_id,
  } as Course;
}

/** Набор курса для ученика (форма ответа courseSetsForStudent в api/_course.js) */
type MembershipSetRow = {
  id: string; userId: string; title: string; description: string; category: string;
  icon: string | null; languageFrom: string; languageTo: string; totalCards: number;
  createdAt: string; updatedAt: string | null; courseId: string;
  isOfficial?: boolean; unitId?: string | null; bookId?: string | null;
  bookTitle?: string | null; unitNumber?: number | null;
};

function mapMembershipSetRow(row: MembershipSetRow, courseId: string): CardSet {
  return {
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
  } as unknown as CardSet;
}

/** Статистика пользователя (серия и итоги) — форма, которую кэширует StreakService */
export type UserStatsData = {
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  timezone: string;
  total_words_learned: number;
  total_minutes_learned: number;
  total_cards_studied: number;
  /** Заморозок серии в запасе */
  streak_freezes: number;
  /** Сегодня заморозка спасла серию (вчера был пропуск) */
  freeze_used: boolean;
};

function mapUserStatsRow(row: any): UserStatsData {
  let timezone: string;
  try {
    timezone = row.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = 'UTC';
  }
  return {
    current_streak: row.current_streak || 0,
    longest_streak: row.longest_streak || 0,
    last_active_date: row.last_active_date ? pgDateToString(row.last_active_date) : null,
    timezone,
    total_words_learned: row.total_words_learned || 0,
    total_minutes_learned: row.total_minutes_learned || 0,
    total_cards_studied: row.total_cards_studied || 0,
    streak_freezes: row.streak_freezes || 0,
    freeze_used: row.freeze_used === true,
  };
}

/** Всё для запуска приложения одним запросом (api/data.js?action=bootstrap) */
export type BootstrapData = {
  sets: CardSet[];
  cards: Card[];
  courses: Array<{ id: string; title: string; createdAt: number; updatedAt?: number }>;
  studentCourses: Course[];
  /** Наборы курсов ученика: courseId → наборы */
  courseSets: Record<string, CardSet[]>;
  stats: UserStatsData | null;
};

export const NeonService = {
  /** Синхронизация с сервером доступна всегда — пропускается только без сессии (см. callDataApi). */
  isEnabled(): boolean {
    return true;
  },

  /**
   * Гарантировать наличие пользователя в таблице users (идемпотентно).
   * email и признак гостя сервер берёт из токена.
   */
  async ensureUserExists(user: EnsureUserArgs): Promise<void> {
    await callDataApi('ensureUserExists', { displayName: user.displayName ?? null });
  },

  /**
   * Проверить, является ли пользователь учителем
   */
  async getIsTeacher(_userId: string): Promise<boolean> {
    const profile = await callDataApi<ProfileRow | null>('getProfile', {}, 'GET');
    return profile?.teacher === true;
  },

  /**
   * Получить user_name пользователя
   */
  async getUserName(_userId: string): Promise<string | null> {
    const profile = await callDataApi<ProfileRow | null>('getProfile', {}, 'GET');
    return profile?.user_name ?? null;
  },

  /**
   * Получить display_name пользователя
   */
  async getDisplayName(_userId: string): Promise<string | null> {
    const profile = await callDataApi<ProfileRow | null>('getProfile', {}, 'GET');
    return profile?.display_name ?? null;
  },

  /**
   * Обновить display_name пользователя
   */
  /**
   * Безвозвратно удалить аккаунт: все данные в Neon и пользователя в Supabase (api/data.js deleteAccount)
   */
  async deleteAccount(): Promise<boolean> {
    return (await callDataApi<boolean>('deleteAccount', { confirm: 'DELETE' })) === true;
  },

  async updateDisplayName(_userId: string, displayName: string): Promise<boolean> {
    return (await callDataApi<boolean>('updateDisplayName', { displayName })) === true;
  },

  /**
   * Обновить user_name пользователя
   */
  async updateUserName(_userId: string, userName: string): Promise<boolean> {
    return (await callDataApi<boolean>('updateUserName', { userName })) === true;
  },

  /**
   * Получить родной язык и изучаемые языки пользователя
   */
  async getLanguagePreferences(
    _userId: string,
  ): Promise<{ nativeLanguage: string | null; targetLanguages: string[] }> {
    const profile = await callDataApi<ProfileRow | null>('getProfile', {}, 'GET');
    return {
      nativeLanguage: profile?.native_language ?? null,
      targetLanguages: profile?.target_languages ?? [],
    };
  },

  /**
   * Обновить родной язык и/или изучаемые языки пользователя
   */
  async updateLanguagePreferences(
    _userId: string,
    data: { nativeLanguage?: string; targetLanguages?: string[] },
  ): Promise<boolean> {
    return (await callDataApi<boolean>('updateLanguagePreferences', data)) === true;
  },

  /**
   * Проверить, завершил ли пользователь онбординг.
   * Нет профиля или нет сети — считаем завершённым (как раньше), чтобы не блокировать вход.
   */
  async checkOnboardingCompleted(_userId: string): Promise<boolean> {
    const profile = await callDataApi<ProfileRow | null>('getProfile', {}, 'GET');
    if (!profile) return true;
    return profile.onboarding_completed === true;
  },

  /**
   * Сохранить данные онбординга и отметить онбординг завершённым
   */
  async saveOnboardingData(
    _userId: string,
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
    await callDataApi('saveOnboardingData', data);
  },

  /**
   * Запуск приложения одним запросом вместо 8–10. Сетевая ошибка — NetworkLoadError
   * (вызывающий оставит на экране сохранённые данные, а не «пусто»).
   */
  async bootstrap(): Promise<BootstrapData> {
    const data = await callDataApi<any>('bootstrap', {}, 'GET', true);
    if (!data) throw new NetworkLoadError('bootstrap');
    const courseSets: Record<string, CardSet[]> = {};
    for (const [courseId, rows] of Object.entries(data.courseSets || {})) {
      courseSets[courseId] = (rows as MembershipSetRow[]).map((row) => mapMembershipSetRow(row, courseId));
    }
    return {
      sets: (data.sets || []).map(mapSetRow),
      cards: (data.cards || []).map(mapCardRow),
      courses: (data.courses || []).map(mapCourseRow),
      studentCourses: (data.studentCourses || []).map(mapStudentCourseRow),
      courseSets,
      stats: data.stats ? mapUserStatsRow(data.stats) : null,
    };
  },

  /**
   * Загрузить все наборы карточек пользователя
   */
  async loadSets(userId?: string, options?: LoadOptions): Promise<CardSet[]> {
    if (!userId) {
      console.warn('userId не передан, пропускаем загрузку наборов');
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
      console.warn('userId не передан, пропускаем загрузку карточек');
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
   * Загрузить все курсы пользователя (где он учитель)
   */
  async loadCourses(userId?: string, options?: LoadOptions): Promise<Array<{
    id: string;
    title: string;
    createdAt: number;
    updatedAt?: number;
  }>> {
    if (!userId) return [];
    const courses = await callDataApi<any[]>('loadCourses', {}, 'GET');
    if (courses === null && options?.throwOnError) throw new NetworkLoadError('loadCourses');
    return (courses || []).map(mapCourseRow);
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
    return (await callDataApi<boolean>('createCourse', {
      id: course.id,
      title: course.title,
      createdAt: course.createdAt,
    })) === true;
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
    return (await callDataApi<boolean>('updateSetMeta', { setId, fields })) === true;
  },

  /**
   * Обновить course_id у набора
   */
  async updateSetCourse(setId: string, courseId: string | null): Promise<boolean> {
    return (await callDataApi<boolean>('updateSetCourse', { setId, courseId })) === true;
  },

  /**
   * Загрузить курсы где пользователь — ученик
   */
  async loadStudentCourses(_userId: string, options?: LoadOptions): Promise<Course[]> {
    const rows = await callDataApi<any[]>('loadStudentCourses', {}, 'GET');
    if (rows === null && options?.throwOnError) throw new NetworkLoadError('loadStudentCourses');
    return (rows || []).map(mapStudentCourseRow);
  },

  // ==================== STREAK SYSTEM ====================

  /**
   * Upsert запись в daily_activity
   */
  async upsertDailyActivity(
    _userId: string,
    localDate: string,
    deltas: { wordsDelta: number; minutesDelta: number; cardsDelta: number }
  ): Promise<boolean> {
    return (await callDataApi<boolean>('upsertDailyActivity', { localDate, deltas })) === true;
  },

  /**
   * Засчитать сегодняшний день в серию. Решает сервер — по журналу ответов (план §3.5):
   * день засчитывается за повторение слов, которым пришло время. true — день засчитан.
   * Пуши о потере серии и о рекорде тоже шлёт сервер.
   */
  async updateUserStatsStreak(
    _userId: string,
    localDate: string,
    yesterdayDate: string,
    deltas: { wordsDelta: number; minutesDelta: number; cardsDelta: number }
  ): Promise<boolean> {
    const result = await callDataApi<{ counted: boolean }>('updateUserStatsStreak', { localDate, yesterdayDate, deltas });
    return result?.counted === true;
  },

  /**
   * Купить заморозку серии за алмазы. null — нет сети; { error } — не хватает алмазов или уже максимум.
   */
  async buyStreakFreeze(): Promise<{ diamonds: number; streakFreezes: number } | { error: 'not_enough_diamonds' | 'max_freezes' | 'unknown' } | null> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return null;
    try {
      const resp = await fetchWithTimeout(`${DATA_API_BASE}?action=buyStreakFreeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}',
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.status === 409) return { error: json?.error === 'max_freezes' ? 'max_freezes' : 'not_enough_diamonds' };
      if (!resp.ok) return { error: 'unknown' };
      return json.data;
    } catch {
      return null;
    }
  },

  /**
   * Записать событие получения/продления стрика (для админ-панели)
   */
  async logStreakEvent(_userId: string, streakDay: number): Promise<void> {
    await callDataApi('logStreakEvent', { streakDay });
  },

  /**
   * Получить активность за последние N дней
   */
  async getWeekActivity(_userId: string, days: number = 7, options?: LoadOptions): Promise<{
    local_date: string;
    words_learned: number;
    minutes_learned: number;
    cards_studied: number;
  }[]> {
    const rows = await callDataApi<any[]>('getWeekActivity', { days }, 'GET', options?.throwOnError);
    return (rows || []).map((row: any) => ({
      local_date: pgDateToString(row.local_date),
      words_learned: row.words_learned || 0,
      minutes_learned: row.minutes_learned || 0,
      cards_studied: row.cards_studied || 0,
    }));
  },

  /**
   * Получить статистику пользователя (сброс серии при пропуске делает сервер)
   */
  async getUserStats(_userId: string, options?: LoadOptions): Promise<UserStatsData | null> {
    const row = await callDataApi<any>('getUserStats', {}, 'GET', options?.throwOnError);
    return row ? mapUserStatsRow(row) : null;
  },

  /**
   * Получить активность за конкретную дату
   */
  async getDailyActivity(_userId: string, localDate: string, options?: LoadOptions): Promise<{
    local_date: string;
    words_learned: number;
    minutes_learned: number;
    cards_studied: number;
  } | null> {
    const row = await callDataApi<any>('getDailyActivity', { localDate }, 'GET', options?.throwOnError);
    if (!row) return null;
    return {
      local_date: pgDateToString(row.local_date),
      words_learned: row.words_learned || 0,
      minutes_learned: row.minutes_learned || 0,
      cards_studied: row.cards_studied || 0,
    };
  },

  // ==================== РЕЙТИНГ КУРСА ====================

  /**
   * Рейтинг курса за неделю (очки считает сервер — api/progress.js).
   * null — нет сессии/сети или нет доступа к курсу.
   */
  async loadLeaderboard(courseId: string, week: 'current' | 'previous' = 'current'): Promise<CourseLeaderboard | null> {
    const board = await callProgressApi<CourseLeaderboard>('leaderboard', { method: 'GET', params: { courseId, week } });
    if (board) writeCache(`leaderboard_${courseId}_${week}`, board);
    return board;
  },

  /** Последний сохранённый рейтинг курса — показать сразу, пока грузится свежий */
  cachedLeaderboard(courseId: string, week: 'current' | 'previous' = 'current'): CourseLeaderboard | null {
    return readCache<CourseLeaderboard>(`leaderboard_${courseId}_${week}`) ?? null;
  },

  /** Учитель включает/выключает рейтинг в своём курсе */
  async setCourseRatingEnabled(courseId: string, enabled: boolean): Promise<boolean> {
    return (await callProgressApi('rating-enabled', { method: 'POST', body: { courseId, enabled } })) !== null;
  },

  /** Ученик скрывает себя из рейтинга курса (таблицу видит, других не видят его) */
  async setHiddenFromRating(courseId: string, hidden: boolean): Promise<boolean> {
    return (await callProgressApi('hide-me', { method: 'POST', body: { courseId, hidden } })) !== null;
  },

  // ==================== CARD PROGRESS ====================

  /**
   * Отправить ответы ученика (до 50 за раз). Уровень и дату повторения считает сервер —
   * в ответе его итоговое состояние каждой карточки. null — нет сессии/сети/ошибка сервера.
   */
  async submitAnswers(answers: Array<{
    answerId: string;
    cardId: string;
    mode: 'test' | 'builder' | 'flashcard';
    chosen?: string;
    selfRating?: number;
    answeredAt: number;
    timeSpentMs?: number;
  }>): Promise<Array<{
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
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return null;
    try {
      const resp = await fetchWithTimeout(`${API_BASE}/progress?action=answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answers }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error('Progress API failed:', json?.error || resp.status);
        // Некорректный ответ не исправится повтором — не держим его в очереди
        return resp.status === 400 ? [] : null;
      }
      return json.results;
    } catch (error) {
      console.error('Progress API network error:', error);
      return null;
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
   * Загрузить наборы курса учителя (для ученика, read-only)
   */
  async loadCourseSetsByMembership(courseId: string, options?: LoadOptions): Promise<CardSet[]> {
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
      // Сеть/сервер — не «пусто»; а 403/404 (ученика убрали из курса) — честно пусто
      if (options?.throwOnError && (result.reason === 'network' || result.status === 0 || result.status >= 500)) {
        throw new NetworkLoadError('loadCourseSetsByMembership');
      }
      console.error('Failed to load course sets by membership:', result.error);
      return [];
    }
    return result.data.sets.map((row) => mapMembershipSetRow(row, courseId));
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
    /** Слова курса, которым пришло время повторения */
    waitingReviews: number;
  }>> {
    type Member = {
      id: string; displayName: string; email: string | null;
      streak: number; lastActiveDate: string | null; todayCards: number; joinedAt: string;
      waitingReviews?: number;
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
      waitingReviews: Number(row.waitingReviews) || 0,
    }));
  },

  /**
   * Учитель просит повторить слова: всему классу (не чаще раза в сутки) или одному ученику.
   * → число учеников, которым ушло напоминание; 'rate_limited' — классу уже напоминали сегодня.
   */
  async remindCourseReview(courseId: string, studentId?: string): Promise<{ students: number; sent: number } | 'rate_limited' | null> {
    const result = await callTeacherApi<{ students: number; sent: number }>('remind-review', {
      method: 'POST',
      body: { courseId, ...(studentId ? { studentId } : {}) },
    });
    if (!result.ok) return result.reason === 'rate_limited' ? 'rate_limited' : null;
    return result.data;
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

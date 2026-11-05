/**
 * Общее для доменов NeonService: запросы к api/data, api/teacher, api/progress, преобразование
 * строк БД, типы (Clean 9 — перенесено из NeonService.ts без изменений).
 */
import { getAccessToken } from '../auth/session';
import { apiFetch } from '../api/client';
import type { Card, CardSet, CardStatus, Course } from '@/types';
import { parseSetKind } from '@/utils/setKind';
import { log } from '@/utils/logger';

// Учительские мутации (курсы/инвайты/ростер/видимость наборов) идут через настоящий backend
// (api/teacher.js), а не напрямую в Neon — он проверяет Supabase JWT вызывающего вместо того,
// чтобы доверять userId, переданному с клиента. См. plan/teacher_access_fix_plan.md, пункт 1.

/**
 * Заголовки запросов к нашему API — как до перевода на apiFetch (Clean 5d.1): Content-Type и на
 * GET. Токен сервисы читают сами ДО своего try (`auth: 'none'` в apiFetch): исключение
 * getAccessToken летит наружу, а не превращается в «нет сети» / null.
 */
export function authHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// Причина отказа — чтобы UI мог показать разный текст под "истёк"/"не найден"/"нет сети" и
// т.д., вместо одного и того же сообщения на всё подряд (план, пункт 13).
export type TeacherApiReason =
  | 'not_found'
  | 'expired'
  | 'own_course'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'bad_request'
  | 'network'
  | 'unknown';

export function reasonFromStatus(status: number): TeacherApiReason {
  switch (status) {
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 410:
      return 'expired';
    case 429:
      return 'rate_limited';
    case 400:
      return 'bad_request';
    default:
      return 'unknown';
  }
}

export async function callTeacherApi<T = any>(
  action: string,
  {
    method = 'GET',
    body,
    params,
  }: { method?: 'GET' | 'POST'; body?: Record<string, any>; params?: Record<string, string> } = {}
): Promise<
  { ok: true; data: T } | { ok: false; error: string; status: number; reason: TeacherApiReason }
> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'Not authenticated', status: 401, reason: 'unauthorized' };

  const query = new URLSearchParams({ action, ...(params || {}) });
  try {
    const res = await apiFetch('teacher', {
      method,
      query,
      headers: authHeaders(token),
      auth: 'none',
      body: method === 'POST' ? body || {} : undefined,
    });
    if (!res.response) {
      const original = res.error.original as { message?: string } | null | undefined;
      return {
        ok: false,
        error: original?.message || 'Network error',
        status: 0,
        reason: 'network',
      };
    }
    const json = res.json;
    if (!res.ok) {
      const reason: TeacherApiReason = json?.reason || reasonFromStatus(res.status);
      return {
        ok: false,
        error: json?.error || `HTTP ${res.status}`,
        status: res.status,
        reason,
      };
    }
    return { ok: true, data: json as T };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Network error', status: 0, reason: 'network' };
  }
}

export type EnsureUserArgs = {
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
export function pgDateToString(value: unknown): string {
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
export function getStatusFromStep(learningStep: number): CardStatus {
  if (learningStep === 0) return 'new';
  if (learningStep <= 2) return 'learning';
  if (learningStep <= 4) return 'young';
  return 'mature';
}

/**
 * Вызов api/data.js. userId сервер берёт из Supabase JWT — параметры userId у методов ниже
 * оставлены только ради совместимости сигнатур вызывающего кода.
 * Возвращает null, если нет сессии, сети или сервер ответил ошибкой.
 */
export async function callDataApi<T = any>(
  action: string,
  params: Record<string, any> = {},
  method: 'GET' | 'POST' = 'POST',
  strict = false
): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const query = new URLSearchParams({ action });
    if (method === 'GET') {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) query.set(key, String(value));
      }
    }
    const res = await apiFetch('data', {
      method,
      query,
      headers: authHeaders(token),
      auth: 'none',
      body: method === 'POST' ? params : undefined,
    });
    if (!res.response) {
      log.warn('Neon', `Data API ${action} network error`, res.error.original);
      if (strict) throw new NetworkLoadError(action);
      return null;
    }
    const json = res.json;
    if (!res.ok) {
      (res.status >= 500 ? log.error : log.warn)(
        'Neon',
        `Data API ${action} failed`,
        res.status,
        json?.error
      );
      if (strict) throw new NetworkLoadError(action, res.status);
      return null;
    }
    return json.data as T;
  } catch (error) {
    if (error instanceof NetworkLoadError) throw error;
    log.warn('Neon', `Data API ${action} network error`, error);
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
      rows: Array<{
        userId: string;
        name: string;
        points: number;
        place: number | null;
        reward: number;
        hidden: boolean;
        isMe: boolean;
      }>;
      me: {
        place: number | null;
        points: number;
        hidden: boolean;
        gapToNext: number | null;
        learnedTotal: number | null;
      } | null;
    };

/** Вызов api/progress.js (рейтинг курса). null — нет сессии, сети или ошибка сервера. */
export async function callProgressApi<T = any>(
  action: string,
  {
    method,
    params,
    body,
  }: { method: 'GET' | 'POST'; params?: Record<string, string>; body?: object }
): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const query = new URLSearchParams({ action, ...(params || {}) });
    const res = await apiFetch('progress', {
      method,
      query,
      headers: authHeaders(token),
      auth: 'none',
      body: body || undefined,
    });
    if (!res.response) {
      log.warn('Neon', `Progress API ${action} network error`, res.error.original);
      return null;
    }
    const json = res.json;
    if (!res.ok) {
      (res.status >= 500 ? log.error : log.warn)(
        'Neon',
        `Progress API ${action} failed`,
        res.status,
        json?.error
      );
      return null;
    }
    return json as T;
  } catch (error) {
    log.warn('Neon', `Progress API ${action} network error`, error);
    return null;
  }
}

/** Загрузка на старте: сетевую ошибку не выдавать за «пусто», иначе сохранённые данные затрутся */
export type LoadOptions = { throwOnError?: boolean };

/** «Написать нам» или окно оценки (api/data.js → submitFeedback) */
export interface FeedbackPayload {
  kind: 'message' | 'rating';
  category?: string;
  rating?: number;
  hasProblem?: boolean | null;
  tags?: string[];
  message?: string;
  appVersion?: string;
  platform?: string;
  osVersion?: string;
}

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

export type ProfileRow = {
  teacher: boolean | null;
  user_name: string | null;
  display_name: string | null;
  native_language: string | null;
  target_languages: string[] | null;
  onboarding_completed: boolean | null;
};

export function mapCardRow(card: any): Card {
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
    // Ни разу не отвечали — 0, а не «сейчас»: по нему сессия набора отличает новое слово от слабого
    lastReviewDate: card.last_reviewed ? new Date(card.last_reviewed).getTime() : 0,
    status: getStatusFromStep(card.learning_step || 0),
  } as Card;
}

export function mapSetRow(set: any): CardSet {
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
    kind: parseSetKind(set.kind),
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

export function mapCourseRow(course: any): {
  id: string;
  title: string;
  createdAt: number;
  updatedAt?: number;
} {
  return {
    id: course.id,
    title: course.title,
    createdAt: new Date(course.created_at).getTime(),
    updatedAt: course.updated_at ? new Date(course.updated_at).getTime() : undefined,
  };
}

export function mapStudentCourseRow(row: any): Course {
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
export type MembershipSetRow = {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  icon: string | null;
  languageFrom: string;
  languageTo: string;
  kind?: string | null;
  totalCards: number;
  createdAt: string;
  updatedAt: string | null;
  courseId: string;
  isOfficial?: boolean;
  unitId?: string | null;
  bookId?: string | null;
  bookTitle?: string | null;
  unitNumber?: number | null;
};

export function mapMembershipSetRow(row: MembershipSetRow, courseId: string): CardSet {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    description: row.description || '',
    category: row.category || '',
    icon: row.icon || null,
    languageFrom: row.languageFrom || 'de',
    languageTo: row.languageTo || 'ru',
    kind: parseSetKind(row.kind),
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

/** Занятие курса: день недели и время начала в поясе курса (2.8) */
export type CourseScheduleItem = { day: string; time: string };

/** Возраст диапазоном — точную дату рождения не спрашиваем (2.7) */
export type AgeRange = 'under13' | '13-17' | '18-24' | '25-34' | '35+';

/** Ответы «о себе» и профиль привычек — для напоминаний (plan/new/push_notifications.md, 2.7) */
export type AboutMe = {
  ageRange: AgeRange | null;
  classDays: string[];
  classHour: number | null;
  learningGoal: string | null;
  /** Подстраивать время напоминаний под привычки */
  useHabits: boolean;
  habits: { usualTime: string | null; usualDays: string[] };
};

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
  /** Сегмент активности из профиля привычек (plan/new/push_notifications.md, 2.6): new / daily / regular / casual / sleeping / lost */
  activity_segment?: string;
};

export function mapUserStatsRow(row: any): UserStatsData {
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
    activity_segment: row.activity_segment || undefined,
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

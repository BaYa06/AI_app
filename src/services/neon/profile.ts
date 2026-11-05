/** Профиль, онбординг, обратная связь, удаление аккаунта, стартовая загрузка (Clean 9 — методы NeonService без изменений). */
import type { CardSet } from '@/types';
import {
  type EnsureUserArgs,
  callDataApi,
  type FeedbackPayload,
  NetworkLoadError,
  type ProfileRow,
  mapCardRow,
  mapSetRow,
  mapCourseRow,
  mapStudentCourseRow,
  type MembershipSetRow,
  mapMembershipSetRow,
  type AgeRange,
  type AboutMe,
  mapUserStatsRow,
  type BootstrapData,
} from './core';

export const profileApi = {
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
   * Проверить, является ли пользователь учителем (null — профиль не загрузился, например нет сети)
   */
  async getIsTeacher(_userId: string): Promise<boolean | null> {
    const profile = await callDataApi<ProfileRow | null>('getProfile', {}, 'GET');
    return profile ? profile.teacher === true : null;
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
   * Обратная связь: «Написать нам» (message) или окно оценки (rating). Смотрится в админке.
   */
  async submitFeedback(payload: FeedbackPayload): Promise<boolean> {
    return (await callDataApi<boolean>('submitFeedback', payload)) === true;
  },

  /**
   * То же, но возвращает id обращения — чтобы сразу открыть переписку (plan/new/support_threads.md).
   * true — сервер ещё без «Моих обращений»: сообщение сохранено, id нет. null — не отправилось.
   */
  async submitFeedbackForThread(payload: FeedbackPayload): Promise<string | true | null> {
    const data = await callDataApi<{ id: string } | boolean>('submitFeedback', {
      ...payload,
      returnId: true,
    });
    if (data === true) return true;
    return data && typeof data === 'object' && data.id ? data.id : null;
  },

  /** «Мои обращения»: список (strict — нужна разница между «пусто» и «не загрузилось») */
  async myFeedback(): Promise<any[]> {
    const data = await callDataApi<any[]>('myFeedback', {}, 'POST', true);
    if (!Array.isArray(data)) throw new NetworkLoadError('myFeedback');
    return data;
  },

  /** Одна переписка; открытие гасит бейдж непрочитанного ответа */
  async feedbackThread(id: string): Promise<any> {
    const data = await callDataApi<any>('feedbackThread', { id }, 'POST', true);
    if (!data) throw new NetworkLoadError('feedbackThread');
    return data;
  },

  /** Дописать в своё обращение. Ошибка — NetworkLoadError со статусом (429 — дневной лимит) */
  async replyFeedback(id: string, message: string): Promise<any> {
    const data = await callDataApi<any>('replyFeedback', { id, message }, 'POST', true);
    if (!data) throw new NetworkLoadError('replyFeedback');
    return data;
  },

  /** Сколько обращений с непрочитанным ответом команды — бейдж в профиле. 0 — и при ошибке */
  async feedbackUnreadCount(): Promise<number> {
    const n = await callDataApi<number>('feedbackUnreadCount');
    return typeof n === 'number' ? n : 0;
  },

  /**
   * Безвозвратно удалить аккаунт: все данные в Neon и пользователя в Supabase (api/data.js deleteAccount).
   * Для аккаунта Sign in with Apple нужен свежий appleAuthorizationCode — по нему сервер отзывает токен Apple.
   */
  async deleteAccount(appleAuthorizationCode?: string): Promise<boolean> {
    return (
      (await callDataApi<boolean>('deleteAccount', {
        confirm: 'DELETE',
        appleAuthorizationCode,
      })) === true
    );
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
  /** «Профиль → Мои данные» (plan/new/push_notifications.md, 2.7): ответы о себе и что известно о привычках */
  async getAboutMe(): Promise<AboutMe | null> {
    return callDataApi<AboutMe | null>('getAboutMe', {}, 'GET');
  },

  /** Сохранить ответы о себе. Поле не передано — не меняется; null — стереть */
  async saveAboutMe(
    data: Partial<Pick<AboutMe, 'ageRange' | 'classDays' | 'classHour' | 'useHabits'>> & {
      clearHabits?: boolean;
    }
  ): Promise<boolean> {
    return (await callDataApi<boolean>('saveAboutMe', data)) === true;
  },

  async getLanguagePreferences(
    _userId: string
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
    data: { nativeLanguage?: string; targetLanguages?: string[] }
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
      ageRange?: AgeRange;
      classDays?: string[];
      classHour?: number;
    }
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
      courseSets[courseId] = (rows as MembershipSetRow[]).map((row) =>
        mapMembershipSetRow(row, courseId)
      );
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
};

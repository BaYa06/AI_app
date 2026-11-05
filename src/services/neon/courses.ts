/** Курсы: свои и ученика, приглашения, ростер, статистика, расписание, рейтинг (Clean 9 — методы NeonService без изменений). */
import { readCache, writeCache } from '../localCache';
import type { CardSet, Course } from '@/types';
import { log } from '@/utils/logger';
import {
  type TeacherApiReason,
  callTeacherApi,
  pgDateToString,
  callDataApi,
  type CourseLeaderboard,
  callProgressApi,
  type LoadOptions,
  NetworkLoadError,
  mapCourseRow,
  mapStudentCourseRow,
  mapMembershipSetRow,
  type CourseScheduleItem,
} from './core';

export const coursesApi = {
  /**
   * Загрузить все курсы пользователя (где он учитель)
   */
  async loadCourses(
    userId?: string,
    options?: LoadOptions
  ): Promise<
    Array<{
      id: string;
      title: string;
      createdAt: number;
      updatedAt?: number;
    }>
  > {
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
    return (
      (await callDataApi<boolean>('createCourse', {
        id: course.id,
        title: course.title,
        createdAt: course.createdAt,
      })) === true
    );
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
   * Рейтинг курса за неделю (очки считает сервер — api/progress.js).
   * null — нет сессии/сети или нет доступа к курсу.
   */
  async loadLeaderboard(
    courseId: string,
    week: 'current' | 'previous' = 'current'
  ): Promise<CourseLeaderboard | null> {
    const board = await callProgressApi<CourseLeaderboard>('leaderboard', {
      method: 'GET',
      params: { courseId, week },
    });
    if (board) writeCache(`leaderboard_${courseId}_${week}`, board);
    return board;
  },

  /** Последний сохранённый рейтинг курса — показать сразу, пока грузится свежий */
  cachedLeaderboard(
    courseId: string,
    week: 'current' | 'previous' = 'current'
  ): CourseLeaderboard | null {
    return readCache<CourseLeaderboard>(`leaderboard_${courseId}_${week}`) ?? null;
  },

  /** Учитель включает/выключает рейтинг в своём курсе */
  async setCourseRatingEnabled(courseId: string, enabled: boolean): Promise<boolean> {
    return (
      (await callProgressApi('rating-enabled', { method: 'POST', body: { courseId, enabled } })) !==
      null
    );
  },

  // ==================== CARD PROGRESS ====================

  /** Расписание занятий курса (plan/new/push_notifications.md, 2.8); null — не удалось загрузить */
  async getCourseSchedule(courseId: string): Promise<CourseScheduleItem[] | null> {
    const result = await callTeacherApi<{ schedule: CourseScheduleItem[] }>('get-schedule', {
      params: { courseId },
    });
    return result.ok ? result.data.schedule : null;
  },

  /** Сохранить расписание; пустой список — убрать. Ученики получат «Скоро занятие» за 1–2 часа */
  async setCourseSchedule(courseId: string, schedule: CourseScheduleItem[]): Promise<boolean> {
    const result = await callTeacherApi('set-schedule', {
      method: 'POST',
      body: { courseId, schedule },
    });
    return result.ok;
  },

  /**
   * Переименовать курс
   */
  async renameCourse(courseId: string, title: string): Promise<boolean> {
    const result = await callTeacherApi('rename-course', {
      method: 'POST',
      body: { courseId, title },
    });
    if (!result.ok) {
      log.error('Neon', 'Failed to rename course', result.error);
      return false;
    }
    return true;
  },

  /**
   * Удалить курс. withSets — вместе с его наборами и карточками (MySets 3),
   * иначе наборы остаются без курса, в «Моих наборах».
   */
  async deleteCourse(courseId: string, options?: { withSets?: boolean }): Promise<boolean> {
    const result = await callTeacherApi('delete-course', {
      method: 'POST',
      body: { courseId, withSets: options?.withSets === true },
    });
    if (!result.ok) {
      log.error('Neon', 'Failed to delete course', result.error);
      return false;
    }
    return true;
  },

  // ==================== COURSE INVITES ====================

  /**
   * Создать или получить существующий инвайт-токен для курса
   */
  async createCourseInvite(
    courseId: string,
    _userId: string
  ): Promise<{ token: string; joinCode: string } | null> {
    // _userId сохранён для обратной совместимости сигнатуры вызывающего кода — реальный
    // владелец теперь определяется backend'ом из Supabase JWT, а не из этого параметра.
    const result = await callTeacherApi<{ token: string; joinCode: string }>('create-invite', {
      method: 'POST',
      body: { courseId },
    });
    if (!result.ok) {
      log.error('Neon', 'Failed to create course invite', result.error);
      return null;
    }
    return { token: result.data.token, joinCode: result.data.joinCode };
  },

  /**
   * Пересоздать инвайт курса — старые token/join_code сразу перестают работать.
   * Использовать, если старая ссылка/код могли утечь не в те руки.
   */
  async regenerateCourseInvite(
    courseId: string
  ): Promise<{ token: string; joinCode: string } | null> {
    const result = await callTeacherApi<{ token: string; joinCode: string }>('regenerate-invite', {
      method: 'POST',
      body: { courseId },
    });
    if (!result.ok) {
      log.error('Neon', 'Failed to regenerate course invite', result.error);
      return null;
    }
    return { token: result.data.token, joinCode: result.data.joinCode };
  },

  /**
   * Получить информацию о курсе по короткому коду (для ученика)
   */
  async getCourseInviteInfoByCode(
    code: string
  ): Promise<
    | { ok: true; courseId: string; courseTitle: string; teacherName: string }
    | { ok: false; reason: TeacherApiReason }
  > {
    const result = await callTeacherApi<{
      courseId: string;
      courseTitle: string;
      teacherName: string;
    }>('invite-info-by-code', { method: 'GET', params: { code } });
    if (!result.ok) {
      if (result.reason !== 'not_found' && result.reason !== 'expired') {
        log.warn('Neon', 'Failed to get course invite info by code', result.error);
      }
      return { ok: false, reason: result.reason };
    }
    return {
      ok: true,
      courseId: result.data.courseId,
      courseTitle: result.data.courseTitle,
      teacherName: result.data.teacherName,
    };
  },

  /**
   * Присоединиться к курсу по короткому коду
   */
  async joinCourseByCode(
    code: string,
    _userId: string
  ): Promise<
    { ok: true; courseId: string; courseTitle: string } | { ok: false; reason: TeacherApiReason }
  > {
    // _userId сохранён для обратной совместимости — backend берёт userId из JWT.
    const result = await callTeacherApi<{ courseId: string; courseTitle: string }>('join-by-code', {
      method: 'POST',
      body: { code },
    });
    if (!result.ok) {
      if (
        result.reason !== 'not_found' &&
        result.reason !== 'expired' &&
        result.reason !== 'own_course'
      ) {
        log.warn('Neon', 'Failed to join course by code', result.error);
      }
      return { ok: false, reason: result.reason };
    }
    return { ok: true, courseId: result.data.courseId, courseTitle: result.data.courseTitle };
  },

  /**
   * Получить информацию о курсе по токену (для модалки у ученика)
   */
  async getCourseInviteInfo(
    token: string
  ): Promise<
    | { ok: true; courseId: string; courseTitle: string; teacherName: string }
    | { ok: false; reason: TeacherApiReason }
  > {
    const result = await callTeacherApi<{
      courseId: string;
      courseTitle: string;
      teacherName: string;
    }>('invite-info-by-token', { method: 'GET', params: { token } });
    if (!result.ok) {
      if (result.reason !== 'not_found' && result.reason !== 'expired') {
        log.warn('Neon', 'Failed to get course invite info', result.error);
      }
      return { ok: false, reason: result.reason };
    }
    return {
      ok: true,
      courseId: result.data.courseId,
      courseTitle: result.data.courseTitle,
      teacherName: result.data.teacherName,
    };
  },

  /**
   * Принять приглашение — добавить ученика в course_members
   */
  async joinCourseByToken(
    token: string,
    _userId: string
  ): Promise<
    { ok: true; courseId: string; courseTitle: string } | { ok: false; reason: TeacherApiReason }
  > {
    // _userId сохранён для обратной совместимости — backend берёт userId из JWT.
    const result = await callTeacherApi<{ courseId: string; courseTitle: string }>(
      'join-by-token',
      {
        method: 'POST',
        body: { token },
      }
    );
    if (!result.ok) {
      if (
        result.reason !== 'not_found' &&
        result.reason !== 'expired' &&
        result.reason !== 'own_course'
      ) {
        log.warn('Neon', 'Failed to join course by token', result.error);
      }
      return { ok: false, reason: result.reason };
    }
    return { ok: true, courseId: result.data.courseId, courseTitle: result.data.courseTitle };
  },

  async removeStudentFromCourse(
    courseId: string,
    studentUserId: string,
    _teacherUserId: string
  ): Promise<boolean> {
    // _teacherUserId сохранён для обратной совместимости — backend берёт userId из JWT.
    const result = await callTeacherApi('remove-student', {
      method: 'POST',
      body: { courseId, studentUserId },
    });
    if (!result.ok) {
      log.error('Neon', 'Failed to remove student from course', result.error);
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
      }>;
    }>('course-sets-by-membership', { method: 'GET', params: { courseId } });
    if (!result.ok) {
      // Сеть/сервер — не «пусто»; а 403/404 (ученика убрали из курса) — честно пусто
      if (
        options?.throwOnError &&
        (result.reason === 'network' || result.status === 0 || result.status >= 500)
      ) {
        throw new NetworkLoadError('loadCourseSetsByMembership');
      }
      log.error('Neon', 'Failed to load course sets by membership', result.error);
      return [];
    }
    return result.data.sets.map((row) => mapMembershipSetRow(row, courseId));
  },

  /**
   * Загрузить участников курса (для кабинета учителя)
   */
  async loadCourseMembers(courseId: string): Promise<
    Array<{
      id: string;
      displayName: string;
      email: string | null;
      streak: number;
      lastActiveDate: string | null;
      todayCards: number;
      joinedAt: number;
      /** Слова курса, которым пришло время повторения */
      waitingReviews: number;
    }>
  > {
    type Member = {
      id: string;
      displayName: string;
      email: string | null;
      streak: number;
      lastActiveDate: string | null;
      todayCards: number;
      joinedAt: string;
      waitingReviews?: number;
    };
    const result = await callTeacherApi<{ members: Member[] }>('list-members', {
      method: 'GET',
      params: { courseId },
    });
    if (!result.ok) {
      log.error('Neon', 'Failed to load course members', result.error);
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
  async remindCourseReview(
    courseId: string,
    studentId?: string
  ): Promise<{ students: number; sent: number } | 'rate_limited' | null> {
    const result = await callTeacherApi<{ students: number; sent: number }>('remind-review', {
      method: 'POST',
      body: { courseId, ...(studentId ? { studentId } : {}) },
    });
    if (!result.ok) return result.reason === 'rate_limited' ? 'rate_limited' : null;
    return result.data;
  },

  async loadCourseActivityChart(
    courseId: string,
    days: number
  ): Promise<Array<{ date: string; count: number }>> {
    // Идёт через backend — раньше шло напрямую в Neon с клиента без проверки владения
    // курсом (см. план, пункт 23).
    const result = await callTeacherApi<{ rows: Array<{ date: string; count: number }> }>(
      'course-activity-chart',
      { method: 'GET', params: { courseId, days: String(days) } }
    );
    if (!result.ok) {
      log.error('Neon', 'Failed to load course activity chart', result.error);
      throw new Error(result.error);
    }
    return result.data.rows;
  },

  async loadCourseSetStats(courseId: string): Promise<
    Array<{
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
    }>
  > {
    // Идёт через backend — раньше шло напрямую в Neon с клиента без проверки владения
    // курсом (см. план, пункт 23).
    const result = await callTeacherApi<{
      sets: Array<{
        setId: string;
        title: string;
        totalCards: number;
        studentsStarted: number;
        studentsCompleted: number;
        progressPct: number;
        isOfficial?: boolean;
        bookTitle?: string | null;
        unitNumber?: number | null;
        unitOpen?: boolean | null;
      }>;
    }>('course-set-stats', { method: 'GET', params: { courseId } });
    if (!result.ok) {
      log.error('Neon', 'Failed to load course set stats', result.error);
      throw new Error(result.error);
    }
    return result.data.sets;
  },

  async loadSetHardCards(
    setId: string,
    courseId: string
  ): Promise<
    Array<{
      cardId: string;
      front: string;
      back: string;
      attempts: number;
    }>
  > {
    // Идёт через backend — раньше шло напрямую в Neon с клиента без проверки владения
    // курсом (см. план, пункт 23).
    const result = await callTeacherApi<{
      cards: Array<{ cardId: string; front: string; back: string; attempts: number }>;
    }>('set-hard-cards', { method: 'GET', params: { setId, courseId } });
    if (!result.ok) {
      log.error('Neon', 'Failed to load set hard cards', result.error);
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
      log.error('Neon', 'Failed to check course ownership', result.error);
      return false;
    }
    return result.data.isOwner;
  },

  async leaveStudentCourse(courseId: string, _userId: string): Promise<boolean> {
    // _userId сохранён для обратной совместимости — backend берёт userId из JWT.
    const result = await callTeacherApi('leave-course', { method: 'POST', body: { courseId } });
    if (!result.ok) {
      log.warn('Neon', 'Failed to leave student course', result.error);
      return false;
    }
    return true;
  },

  /**
   * Загрузить детальную статистику ученика по курсу (для карточки детального просмотра).
   * Возвращает прогресс по каждому набору и суммарные выученные/не выученные карточки.
   * "Выученная" карточка — learning_step >= 3 (young / mature).
   */
  async loadStudentCourseStats(
    courseId: string,
    studentId: string
  ): Promise<{
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
    }>('student-stats', { method: 'GET', params: { courseId, studentId } });
    if (!result.ok) {
      log.error('Neon', 'Failed to load student course stats', result.error);
      throw new Error(result.error);
    }
    return result.data;
  },

  async toggleSetHiddenFromStudents(setId: string, hidden: boolean): Promise<boolean> {
    const result = await callTeacherApi('toggle-set-hidden', {
      method: 'POST',
      body: { setId, hidden },
    });
    if (!result.ok) {
      log.error('Neon', 'Failed to toggle set hidden from students', result.error);
      return false;
    }
    return true;
  },
};

/**
 * Данные кабинета учителя (plan/new/web_cabinet.md, Web 4–10): тонкая обёртка над api/teacher.js,
 * api/data.js и api/test.js. Не бросает ничего, кроме WebApiError, — экраны показывают понятный текст.
 * Логика запросов и формы ответов — те же, что в телефоне (services/neon/*).
 */
import { callDataApi, callTeacherApi } from '@/services/neon/core';
import { mapCourseRow } from '@/services/neon/core';
import { getAccessToken } from '@/services/auth/session';
import { rawApiFetch } from '@/services/api/client';
import type { HardCard } from '@/services/lessonPrep';
import type { ActiveTest } from '@/services/activeTest';
import type { ScheduleItem } from '@/utils/nextLesson';
import type { StudentDetailData } from '@/screens/studentDetail/studentInsight';
import { WebApiError, classifyStatus } from '../api';
import { previewMode } from '../preview';
import type { Member } from '../teacherLogic';

export type WebCourse = { id: string; title: string; createdAt: number };
export type CourseInvite = { token: string; joinCode: string };
export type ActivityDay = { date: string; count: number };

type CallOpts = {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  params?: Record<string, string>;
};

async function teacherCall<T>(action: string, opts: CallOpts = {}): Promise<T> {
  const result = await callTeacherApi<T>(action, opts);
  if (result.ok) return result.data;
  throw new WebApiError(classifyStatus(result.status), result.status);
}

/** Данные для предпросмотра без сервера (только dev) */
function preview() {
  return previewMode() === 'teacher' && __DEV__ ? require('./previewData').PreviewData : null;
}

export const TeacherData = {
  async courses(): Promise<WebCourse[]> {
    const fake = preview();
    if (fake) return fake.courses();
    const rows = await callDataApi<unknown[]>('loadCourses', {}, 'GET');
    // null — сеть или сервер; пустой список — у учителя просто нет курсов
    if (rows === null) throw new WebApiError('network');
    return rows.map((row) => {
      const c = mapCourseRow(row);
      return { id: c.id, title: c.title, createdAt: c.createdAt };
    });
  },

  async members(courseId: string): Promise<Member[]> {
    const fake = preview();
    if (fake) return fake.members(courseId);
    type Row = Omit<Member, 'joinedAt' | 'displayName'> & {
      displayName: string | null;
      joinedAt: string;
    };
    const data = await teacherCall<{ members: Row[] }>('list-members', { params: { courseId } });
    return data.members.map((m) => ({
      id: m.id,
      displayName: m.displayName || 'Ученик',
      email: m.email || null,
      streak: m.streak || 0,
      lastActiveDate: m.lastActiveDate ? String(m.lastActiveDate).slice(0, 10) : null,
      todayCards: Number(m.todayCards) || 0,
      joinedAt: new Date(m.joinedAt).getTime(),
      waitingReviews: Number(m.waitingReviews) || 0,
    }));
  },

  async schedule(courseId: string): Promise<ScheduleItem[]> {
    const fake = preview();
    if (fake) return fake.schedule(courseId);
    const data = await teacherCall<{ schedule: ScheduleItem[] }>('get-schedule', {
      params: { courseId },
    });
    return data.schedule ?? [];
  },

  async activity(courseId: string, days = 7): Promise<ActivityDay[]> {
    const fake = preview();
    if (fake) return fake.activity();
    const data = await teacherCall<{ rows: ActivityDay[] }>('course-activity-chart', {
      params: { courseId, days: String(days) },
    });
    return data.rows;
  },

  async hardCards(courseId: string): Promise<HardCard[]> {
    const fake = preview();
    if (fake) return fake.hardCards();
    const data = await teacherCall<{ cards: HardCard[] }>('course-hard-cards', {
      params: { courseId },
    });
    return data.cards;
  },

  async studentStats(courseId: string, studentId: string): Promise<StudentDetailData> {
    const fake = preview();
    if (fake) return fake.studentStats(studentId);
    return teacherCall<StudentDetailData>('student-stats', { params: { courseId, studentId } });
  },

  /** Незавершённые тесты учителя; ошибка сети — пустой список (плашка просто не покажется) */
  async activeTests(): Promise<ActiveTest[]> {
    const fake = preview();
    if (fake) return fake.activeTests();
    try {
      const token = await getAccessToken();
      if (!token) return [];
      const res = await rawApiFetch('test?action=active', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? (data as ActiveTest[]) : [];
    } catch {
      return [];
    }
  },

  async createCourse(title: string): Promise<WebCourse> {
    const fake = preview();
    if (fake) return fake.createCourse(title);
    const { v4: uuid } = await import('uuid');
    const course = { id: uuid(), title: title.trim(), createdAt: Date.now() };
    const ok = await callDataApi<boolean>('createCourse', course);
    if (ok !== true) throw new WebApiError('network');
    return course;
  },

  async renameCourse(courseId: string, title: string): Promise<void> {
    if (preview()) return;
    await teacherCall('rename-course', { method: 'POST', body: { courseId, title: title.trim() } });
  },

  async deleteCourse(courseId: string, withSets: boolean): Promise<void> {
    if (preview()) return;
    await teacherCall('delete-course', { method: 'POST', body: { courseId, withSets } });
  },

  async invite(courseId: string): Promise<CourseInvite> {
    const fake = preview();
    if (fake) return fake.invite();
    return teacherCall<CourseInvite>('create-invite', { method: 'POST', body: { courseId } });
  },

  async regenerateInvite(courseId: string): Promise<CourseInvite> {
    const fake = preview();
    if (fake) return fake.invite();
    return teacherCall<CourseInvite>('regenerate-invite', { method: 'POST', body: { courseId } });
  },

  async removeStudent(courseId: string, studentUserId: string): Promise<void> {
    if (preview()) return;
    await teacherCall('remove-student', { method: 'POST', body: { courseId, studentUserId } });
  },

  /** Напомнить повторить слова: всему курсу (раз в сутки) или одному ученику */
  async remind(
    courseId: string,
    studentId?: string
  ): Promise<{ students: number; sent: number } | 'rate_limited'> {
    const fake = preview();
    if (fake) return { students: 1, sent: 1 };
    const result = await callTeacherApi<{ students: number; sent: number }>('remind-review', {
      method: 'POST',
      body: { courseId, ...(studentId ? { studentId } : {}) },
    });
    if (result.ok) return result.data;
    if (result.reason === 'rate_limited') return 'rate_limited';
    throw new WebApiError(classifyStatus(result.status), result.status);
  },
};

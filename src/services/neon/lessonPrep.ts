/** Подготовка к уроку (plan/new/teacher_cabinet.md, этап 3): запросы api/teacher.js. */
import { callTeacherApi } from './core';
import type { HardCard, SetStudent } from '../lessonPrep';
import type { TeacherNotification } from '../teacherNotifications';
import { reportQuery, type ReportParams, type TeacherReport } from '../teacherReport';

export const lessonPrepApi = {
  /** Трудные слова группы за 14 дней; null — нет сети или ошибка. */
  async loadCourseHardCards(courseId: string): Promise<HardCard[] | null> {
    const res = await callTeacherApi<{ cards: HardCard[] }>('course-hard-cards', {
      params: { courseId },
    });
    return res.ok ? res.data.cards : null;
  },

  /** Ученики курса по набору: прошёл / начал / не открывал; null — нет сети или ошибка. */
  async loadCourseSetStudents(courseId: string, setId: string): Promise<SetStudent[] | null> {
    const res = await callTeacherApi<{ students: SetStudent[] }>('course-set-students', {
      params: { courseId, setId },
    });
    return res.ok ? res.data.students : null;
  },

  /** «Напомнить N»: выбранным ученикам, каждому не чаще раза в 20 часов (Teacher 36). */
  async remindStudents(
    courseId: string,
    studentIds: string[]
  ): Promise<{ students: number; sent: number; skipped: number } | null> {
    const res = await callTeacherApi<{ students: number; sent: number; skipped: number }>(
      'remind-review',
      { method: 'POST', body: { courseId, studentIds } }
    );
    return res.ok ? res.data : null;
  },

  /** Колокольчик учителя (Teacher 49): записи за 30 дней; null — нет сети или старый сервер. */
  async loadTeacherNotifications(): Promise<{
    notifications: TeacherNotification[];
    unseen: number;
  } | null> {
    const res = await callTeacherApi<{ notifications: TeacherNotification[]; unseen: number }>(
      'teacher-notifications'
    );
    return res.ok ? { notifications: res.data.notifications, unseen: res.data.unseen } : null;
  },

  async markTeacherNotificationsSeen(): Promise<boolean> {
    return (await callTeacherApi('teacher-notifications-seen', { method: 'POST' })).ok;
  },

  /** Превью отчёта (Teacher 55); null — нет сети или ошибка. */
  async loadReport(params: ReportParams): Promise<TeacherReport | null> {
    const res = await callTeacherApi<{ report: TeacherReport }>('report-data', {
      params: reportQuery(params),
    });
    return res.ok ? res.data.report : null;
  },

  /** Ссылка на отчёт `/r/<код>` — снимок с комментарием учителя, живёт 30 дней. */
  async createReportLink(params: ReportParams): Promise<{ code: string; url: string } | null> {
    const res = await callTeacherApi<{ code: string; url: string }>('report-create', {
      method: 'POST',
      body: { ...reportQuery(params), comment: params.comment ?? '' },
    });
    return res.ok ? { code: res.data.code, url: res.data.url } : null;
  },

  /** PDF отчёта: файл собирает сервер. */
  async loadReportPdf(params: ReportParams): Promise<{ filename: string; base64: string } | null> {
    const res = await callTeacherApi<{ filename: string; base64: string }>('report-pdf', {
      method: 'POST',
      body: { ...reportQuery(params), comment: params.comment ?? '' },
    });
    return res.ok ? { filename: res.data.filename, base64: res.data.base64 } : null;
  },
};

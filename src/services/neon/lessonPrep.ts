/** Подготовка к уроку (plan/new/teacher_cabinet.md, этап 3): запросы api/teacher.js. */
import { callTeacherApi } from './core';
import type { HardCard, SetStudent } from '../lessonPrep';
import type { TeacherNotification } from '../teacherNotifications';

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
};

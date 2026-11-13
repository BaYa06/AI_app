/** Задания учителя (plan/new/teacher_cabinet.md, этап 2): api/teacher.js и api/progress.js. */
import { callProgressApi, callTeacherApi, type TeacherApiReason } from './core';
import type {
  HomeworkStatusData,
  HomeworkSubmission,
  StudentHomework,
  TeacherHomeworkSummary,
} from '../homework';

type Fail = { ok: false; reason: TeacherApiReason };

export interface CreateHomeworkInput {
  courseId: string;
  title: string;
  cardIds: string[];
  dueAt: string;
  minScore: number | null;
  /** null — вся группа */
  userIds: string[] | null;
  /** 'review' — «Повторить трудные» (Teacher 43); нет — 'learn' */
  kind?: 'learn' | 'review';
}

export const homeworkApi = {
  /** Учитель выдаёт задание. reason — для текста ошибки в окне. */
  async createHomework(input: CreateHomeworkInput): Promise<{ ok: true; id: string } | Fail> {
    const res = await callTeacherApi<{ homework: { id: string } }>('homework-create', {
      method: 'POST',
      body: { ...input },
    });
    return res.ok ? { ok: true, id: res.data.homework.id } : { ok: false, reason: res.reason };
  },

  /** Активные задания курса; null — нет сети или ошибка. */
  async loadCourseHomework(courseId: string): Promise<TeacherHomeworkSummary[] | null> {
    const res = await callTeacherApi<{ homework: TeacherHomeworkSummary[] }>('homework-list', {
      params: { courseId },
    });
    return res.ok ? res.data.homework : null;
  },

  async loadHomeworkStatus(homeworkId: string): Promise<HomeworkStatusData | null> {
    const res = await callTeacherApi<HomeworkStatusData>('homework-status', {
      params: { homeworkId },
    });
    return res.ok ? res.data : null;
  },

  async cancelHomework(homeworkId: string): Promise<boolean> {
    const res = await callTeacherApi('homework-cancel', { method: 'POST', body: { homeworkId } });
    return res.ok;
  },

  /** «Напомнить» выбранным: reminded — кому ушло, skipped — уже напоминали сегодня или сдали. */
  async remindHomework(
    homeworkId: string,
    userIds: string[]
  ): Promise<{ reminded: number; skipped: number } | null> {
    const res = await callTeacherApi<{ reminded: number; skipped: number }>('homework-remind', {
      method: 'POST',
      body: { homeworkId, userIds },
    });
    return res.ok ? res.data : null;
  },

  /** «Оценки в Excel»: xlsx собирает сервер. null — нет сети или ошибка. */
  async exportHomework(homeworkId: string): Promise<{ filename: string; base64: string } | null> {
    const res = await callTeacherApi<{ filename: string; base64: string }>('homework-export', {
      params: { homeworkId },
    });
    return res.ok ? res.data : null;
  },

  /** Задания ученика; null — нет сети или ошибка (показываем кэш). */
  async loadMyHomework(): Promise<StudentHomework[] | null> {
    const res = await callProgressApi<{ homework: StudentHomework[] }>('my-homework', {
      method: 'GET',
    });
    return res ? res.homework : null;
  },

  /**
   * Итог законченной сессии. null — не дошло (очередь повторит). Сервер без заданий
   * (400 «Unknown action») — пустой итог: задача очереди выполнена, повторять нечего.
   */
  async reportHomeworkSession(
    cards: Array<{ cardId: string; firstTry: boolean }>
  ): Promise<{ credited: number; submitted: HomeworkSubmission[] } | null> {
    return callProgressApi('session-complete', {
      method: 'POST',
      body: { cards },
      unknownAction: { credited: 0, submitted: [] },
    });
  },
};

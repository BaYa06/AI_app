/**
 * Задания курса в веб-кабинете: тонкая обёртка над api/teacher.js (homework-*), те же запросы,
 * что у телефона (services/neon/homework.ts). Любая ошибка — WebApiError (с причиной сервера).
 */
import { callDataApi, callTeacherApi } from '@/services/neon/core';
import type { HomeworkStatusData, TeacherHomeworkSummary } from '@/services/homework';
import type { PickerSet } from '@/components/teacher/wordPicker';
import { sortPickerSets } from '@/components/teacher/wordPicker';
import { WebApiError, classifyStatus } from '../api';
import { ExamData } from './exam';

type CallOpts = {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  params?: Record<string, string>;
};

async function call<T>(action: string, opts: CallOpts = {}): Promise<T> {
  const res = await callTeacherApi<T>(action, opts);
  if (res.ok) return res.data;
  // reason — короткая причина сервера (dueAt, cardIds, userIds…): по ней — точный текст ошибки
  throw new WebApiError(classifyStatus(res.status), res.status, res.reason || res.error);
}

export interface NewHomework {
  courseId: string;
  title: string;
  cardIds: string[];
  dueAt: string;
  minScore: number | null;
  /** null — вся группа */
  userIds: string[] | null;
}

export const HomeworkData = {
  /** Все задания курса, вместе с отменёнными (группы «Идут сейчас / Прошедшие / Отменённые») */
  async list(courseId: string): Promise<TeacherHomeworkSummary[]> {
    const data = await call<{ homework: TeacherHomeworkSummary[] }>('homework-list', {
      params: { courseId, history: '1' },
    });
    return data.homework ?? [];
  },

  status(homeworkId: string): Promise<HomeworkStatusData> {
    return call<HomeworkStatusData>('homework-status', { params: { homeworkId } });
  },

  async create(input: NewHomework): Promise<string> {
    const data = await call<{ homework: { id: string } }>('homework-create', {
      method: 'POST',
      body: { ...input },
    });
    return data.homework.id;
  },

  async cancel(homeworkId: string): Promise<void> {
    await call('homework-cancel', { method: 'POST', body: { homeworkId } });
  },

  /** Перенести срок; ответ — срок, который сохранил сервер */
  async due(homeworkId: string, dueAt: string): Promise<string> {
    const data = await call<{ dueAt: string }>('homework-due', {
      method: 'POST',
      body: { homeworkId, dueAt },
    });
    return data.dueAt;
  },

  /** «Напомнить»: reminded — кому ушло, skipped — уже напоминали сегодня или сдали */
  remind(homeworkId: string, userIds: string[]): Promise<{ reminded: number; skipped: number }> {
    return call('homework-remind', { method: 'POST', body: { homeworkId, userIds } });
  },

  /** «Оценки в Excel»: xlsx собирает сервер */
  exportXlsx(homeworkId: string): Promise<{ filename: string; base64: string }> {
    return call('homework-export', { params: { homeworkId } });
  },

  /** Наборы курса со словами — из чего выбирать слова задания */
  async pickerSets(courseId: string): Promise<PickerSet[]> {
    const stats = await ExamData.sets(courseId);
    const sets = await Promise.all(
      stats.map(async (s) => {
        const rows = await callDataApi<Array<{ id: string; front?: string; back?: string }>>(
          'loadCardsBySet',
          { setId: s.setId },
          'GET'
        );
        if (rows === null) throw new WebApiError('network');
        return {
          id: s.setId,
          title: s.title,
          words: rows.map((r) => ({ id: r.id, front: r.front || '', back: r.back || '' })),
        };
      })
    );
    return sortPickerSets(sets.filter((s) => s.words.length > 0));
  },
};

/** Скачать xlsx из base64 (в браузере вместо «Поделиться» из приложения) */
export function downloadBase64(filename: string, base64: string, mime: string): void {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

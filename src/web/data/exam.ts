/**
 * Данные экзаменов кабинета (plan/new/web_cabinet.md, Web 12–17): тонкая обёртка над ExamApi
 * и «умными вариантами». Любая ошибка — WebApiError (с текстом сервера в serverError).
 */
import { ExamApi, type ExamDraft, type ExamListItem } from '@/services/exam';
import { getAccessToken } from '@/services/auth/session';
import { rawApiFetch } from '@/services/api/client';
import { WebApiError, classifyStatus, unwrap } from '../api';
import { previewMode } from '../preview';
import type { SmartResult } from '../exam/smartLogic';

function preview() {
  return previewMode() === 'teacher' && __DEV__ ? require('./previewData').PreviewExam : null;
}

export type SetStat = { setId: string; title: string; totalCards: number };

export const ExamData = {
  async list(courseId?: string): Promise<ExamListItem[]> {
    const fake = preview();
    if (fake) return fake.list();
    const data = unwrap(await ExamApi.list(courseId));
    return Array.isArray(data) ? data : [];
  },

  /** Наборы курса со словами — из чего собирать экзамен */
  async sets(courseId: string): Promise<SetStat[]> {
    const fake = preview();
    if (fake) return fake.setStats();
    const { callTeacherApi } = await import('@/services/neon/core');
    const res = await callTeacherApi<{ sets: SetStat[] }>('course-set-stats', {
      params: { courseId },
    });
    if (!res.ok) throw new WebApiError(classifyStatus(res.status), res.status, res.error);
    return res.data.sets.filter((s) => s.totalCards > 0);
  },

  async build(body: Record<string, unknown>): Promise<ExamDraft> {
    const fake = preview();
    if (fake) return fake.build();
    return unwrap(await ExamApi.build(body));
  },

  async draft(sessionId: string): Promise<ExamDraft> {
    const fake = preview();
    if (fake) return fake.draft(sessionId);
    return unwrap(await ExamApi.draft(sessionId));
  },

  async replace(sessionId: string, itemId: string): Promise<ExamDraft> {
    const fake = preview();
    if (fake) return fake.replace(itemId);
    return unwrap(await ExamApi.replace(sessionId, itemId));
  },

  async editItem(
    sessionId: string,
    itemId: string,
    patch: { distractors?: string[]; sentence?: string; source?: 'ai'; doubtful?: boolean }
  ): Promise<ExamDraft> {
    const fake = preview();
    if (fake) return fake.editItem(itemId, patch);
    const res = await ExamApi.editItem(sessionId, itemId, patch);
    if (res.ok) return res.data;
    const err = new WebApiError(classifyStatus(res.status), res.status, res.error);
    err.details = res.data as unknown as Record<string, unknown>;
    throw err;
  },

  async create(
    sessionId: string
  ): Promise<{ code: string; questionCount: number; durationSec: number }> {
    const fake = preview();
    if (fake) return fake.create();
    return unwrap(await ExamApi.create(sessionId));
  },

  /** «Умные варианты»: ИИ готовит предложения, ничего не записывает. Занимает 15–30 секунд. */
  async smart(sessionId: string, kinds: ('gap' | 'choice')[]): Promise<SmartResult> {
    const fake = preview();
    if (fake) return fake.smart();
    const token = await getAccessToken();
    if (!token) throw new WebApiError('unauthorized', 401);
    let res: Response;
    try {
      res = await rawApiFetch('ai?fn=exam-smart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: { sessionId, kinds },
      });
    } catch {
      throw new WebApiError('network', 0);
    }
    let data: { error?: string } & Partial<SmartResult> = {};
    try {
      data = await res.json();
    } catch {
      // тело не JSON — ошибка ниже
    }
    if (!res.ok) throw new WebApiError(classifyStatus(res.status), res.status, data.error);
    return {
      suggestions: data.suggestions ?? [],
      skipped: data.skipped ?? [],
      usage: data.usage ?? null,
    };
  },
};

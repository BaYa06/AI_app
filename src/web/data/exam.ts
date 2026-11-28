/**
 * Данные экзаменов кабинета (plan/new/web_cabinet.md, Web 12–17): тонкая обёртка над ExamApi
 * и «умными вариантами». Любая ошибка — WebApiError (с текстом сервера в serverError).
 */
import {
  ExamApi,
  type ExamDraft,
  type ExamListItem,
  type ExamResults,
  type ExamStudentCard,
  type QuestionReview,
} from '@/services/exam';
import { getAccessToken } from '@/services/auth/session';
import { rawApiFetch } from '@/services/api/client';
import { WebApiError, classifyStatus, unwrap } from '../api';
import { previewMode } from '../preview';

function preview() {
  if (previewMode() !== 'teacher' || !__DEV__) return null;
  const data = require('./previewData');
  return { ...data.PreviewExam, ...data.PreviewResults };
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

  /**
   * «Вставь слово» пишет ИИ: предложение, форма слова, неверные варианты — сразу в черновик.
   * fallback: true — без ИИ, такие вопросы становятся «письменным ответом». Занимает 15–40 секунд.
   */
  async gapAi(
    sessionId: string,
    fallback = false
  ): Promise<{ written: number; fallback: number; pending: number }> {
    const fake = preview();
    if (fake) return fake.gapAi(fallback);
    const token = await getAccessToken();
    if (!token) throw new WebApiError('unauthorized', 401);
    let res: Response;
    try {
      res = await rawApiFetch('ai?fn=exam-gap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: { sessionId, ...(fallback ? { fallback: true } : {}) },
      });
    } catch {
      throw new WebApiError('network', 0);
    }
    let data: { error?: string; written?: number; fallback?: number; pending?: number } = {};
    try {
      data = await res.json();
    } catch {
      // тело не JSON — ошибка ниже
    }
    if (!res.ok) throw new WebApiError(classifyStatus(res.status), res.status, data.error);
    return { written: data.written ?? 0, fallback: data.fallback ?? 0, pending: data.pending ?? 0 };
  },

  // ─── Итоги и разбор (Web 23–25) ───

  async results(sessionId: string): Promise<ExamResults> {
    const fake = preview();
    if (fake) return fake.results();
    return unwrap(await ExamApi.results(sessionId));
  },

  async question(sessionId: string, itemId: string): Promise<QuestionReview> {
    const fake = preview();
    if (fake) return fake.question(itemId);
    return unwrap(await ExamApi.question(sessionId, itemId));
  },

  async decide(
    sessionId: string,
    itemId: string,
    decision: 'void' | 'accept' | 'keep',
    answer?: string
  ): Promise<{ logId: string }> {
    const fake = preview();
    if (fake) return fake.decide(itemId, decision, answer);
    return unwrap(await ExamApi.decide(sessionId, itemId, decision, answer));
  },

  async undo(sessionId: string, logId: string): Promise<void> {
    const fake = preview();
    if (fake) return fake.undo(logId);
    unwrap(await ExamApi.undo(sessionId, logId));
  },

  async override(
    sessionId: string,
    participantId: string,
    score: number | null,
    comment?: string
  ): Promise<void> {
    const fake = preview();
    if (fake) return fake.override(participantId, score, comment);
    unwrap(await ExamApi.override(sessionId, participantId, score, comment));
  },

  async release(sessionId: string): Promise<void> {
    const fake = preview();
    if (fake) return fake.release();
    unwrap(await ExamApi.release(sessionId));
  },

  async student(sessionId: string, participantId: string): Promise<ExamStudentCard> {
    const fake = preview();
    if (fake) return fake.student(participantId);
    return unwrap(await ExamApi.student(sessionId, participantId));
  },

  async homework(sessionId: string, dueAt: string): Promise<{ created: number; failed: number }> {
    const fake = preview();
    if (fake) return { created: 8, failed: 0 };
    const data = unwrap(await ExamApi.homework(sessionId, dueAt));
    return { created: data.created.length, failed: data.failed.length };
  },

  /** Пересдача: новый черновик с теми же словами и вариантами; возвращает его id */
  async retake(sessionId: string): Promise<string> {
    const fake = preview();
    if (fake) return fake.retake();
    return unwrap(await ExamApi.retake(sessionId)).sessionId;
  },
};

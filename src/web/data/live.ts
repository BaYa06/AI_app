/**
 * Лобби и монитор экзамена (plan/new/web_cabinet.md, Web 18–22): запросы к api/test.js.
 * Опрос раз в 3–4 с делает экран (useLoad с refreshMs), здесь — только вызовы.
 */
import { ExamApi, type ExamEvent } from '@/services/exam';
import { getAccessToken } from '@/services/auth/session';
import { rawApiFetch } from '@/services/api/client';
import { WebApiError, classifyStatus, unwrap } from '../api';
import { previewMode } from '../preview';
import type { Monitor } from '../exam/liveLogic';

function preview() {
  return previewMode() === 'teacher' && __DEV__ ? require('./previewData').PreviewLive : null;
}

async function testCall<T>(
  action: string,
  opts: {
    method?: 'GET' | 'POST';
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  } = {}
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new WebApiError('unauthorized', 401);
  const qs = new URLSearchParams({ action, ...(opts.query || {}) }).toString();
  let res: Response;
  try {
    res = await rawApiFetch(`test?${qs}`, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(opts.method === 'POST' ? { body: opts.body || {} } : {}),
    });
  } catch {
    throw new WebApiError('network', 0);
  }
  let data: { error?: string } = {};
  try {
    data = await res.json();
  } catch {
    // не JSON
  }
  if (!res.ok) throw new WebApiError(classifyStatus(res.status), res.status, data.error);
  return data as T;
}

export const LiveData = {
  monitor(sessionId: string): Promise<Monitor> {
    const fake = preview();
    if (fake) return fake.monitor(sessionId);
    return testCall<Monitor>('monitor', { query: { sessionId } });
  },

  async start(sessionId: string): Promise<void> {
    const fake = preview();
    if (fake) return fake.start(sessionId);
    await testCall('start', { method: 'POST', body: { sessionId } });
  },

  async finish(sessionId: string): Promise<void> {
    const fake = preview();
    if (fake) return fake.finish(sessionId);
    await testCall('finish', { method: 'POST', body: { sessionId } });
  },

  async reinstate(sessionId: string, userId: string): Promise<void> {
    const fake = preview();
    if (fake) return fake.reinstate(sessionId, userId);
    await testCall('reinstate', { method: 'POST', body: { sessionId, userId } });
  },

  async pause(sessionId: string, paused: boolean): Promise<boolean> {
    const fake = preview();
    if (fake) return fake.pause(sessionId, paused);
    return unwrap(await ExamApi.pause(sessionId, paused)).paused;
  },

  async extraTime(sessionId: string, userId: string, minutes = 2): Promise<void> {
    const fake = preview();
    if (fake) return;
    unwrap(await ExamApi.extraTime(sessionId, userId, minutes));
  },

  /** Журнал: ошибка не мешает монитору — пустой список */
  async events(sessionId: string): Promise<ExamEvent[]> {
    const fake = preview();
    if (fake) return fake.events(sessionId);
    const res = await ExamApi.events(sessionId);
    return res.ok && Array.isArray(res.data.events) ? res.data.events : [];
  },
};

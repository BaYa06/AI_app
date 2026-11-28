/**
 * Журнал событий экзамена (plan/new/web_cabinet.md, Web 22). Подставной sql: проверяем, что запись
 * не роняет экзамен, не пишет чужое и не спамит одинаковыми событиями.
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../_log.js', () => ({
  log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));

import { EVENT_KINDS, logExamEvent, logOldVersionAttempt } from '../_exam/events.js';

const SID = '11111111-1111-4111-8111-111111111111';
const UID = '22222222-2222-4222-8222-222222222222';

function recorder(fail = false) {
  const calls = [];
  const sql = (strings, ...values) => {
    calls.push({ text: strings.join('?').replace(/\s+/g, ' ').trim(), values });
    return fail ? Promise.reject(new Error('db down')) : Promise.resolve([]);
  };
  return { sql, calls };
}

describe('logExamEvent', () => {
  it('пишет событие известного вида', async () => {
    const { sql, calls } = recorder();
    expect(
      await logExamEvent(sql, {
        sessionId: SID,
        userId: UID,
        kind: 'away',
        detail: { reason: 'split' },
      })
    ).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toMatch(/INSERT INTO exam_events/);
    expect(calls[0].values).toContain('away');
    expect(calls[0].values).toContain(JSON.stringify({ reason: 'split' }));
  });
  it('неизвестный вид и пустая сессия — не пишем и не падаем', async () => {
    const { sql, calls } = recorder();
    expect(await logExamEvent(sql, { sessionId: SID, kind: 'hack' })).toBe(false);
    expect(await logExamEvent(sql, { sessionId: '', kind: 'away' })).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it('ошибка базы не пробрасывается (экзамен из-за журнала не ломается)', async () => {
    const { sql } = recorder(true);
    await expect(logExamEvent(sql, { sessionId: SID, kind: 'paused' })).resolves.toBe(false);
  });
  it('с dedupeSec вставка идёт с проверкой «такого ещё не было»', async () => {
    const { sql, calls } = recorder();
    await logExamEvent(sql, { sessionId: SID, userId: UID, kind: 'old_version', dedupeSec: 120 });
    expect(calls[0].text).toMatch(/WHERE NOT EXISTS/);
    expect(calls[0].values).toContain(120);
  });
  it('все виды из списка принимаются', async () => {
    const { sql, calls } = recorder();
    for (const kind of EVENT_KINDS) await logExamEvent(sql, { sessionId: SID, kind });
    expect(calls).toHaveLength(EVENT_KINDS.length);
  });
});

describe('logOldVersionAttempt', () => {
  it('пишет только участника курса и не чаще раза в 2 минуты', async () => {
    const { sql, calls } = recorder();
    await logOldVersionAttempt(sql, { id: SID, course_id: SID }, UID);
    expect(calls[0].text).toMatch(/FROM course_members/);
    expect(calls[0].text).toMatch(/NOT EXISTS/);
    expect(calls[0].text).toMatch(/2 minutes/);
  });
  it('без сессии, курса или ученика — ничего', async () => {
    const { sql, calls } = recorder();
    expect(await logOldVersionAttempt(sql, null, UID)).toBe(false);
    expect(await logOldVersionAttempt(sql, { id: SID }, UID)).toBe(false);
    expect(await logOldVersionAttempt(sql, { id: SID, course_id: SID }, null)).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it('сбой базы — false, без исключения', async () => {
    const { sql } = recorder(true);
    await expect(logOldVersionAttempt(sql, { id: SID, course_id: SID }, UID)).resolves.toBe(false);
  });
});

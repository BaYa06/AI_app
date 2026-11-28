/**
 * Лобби экзамена/теста (api/_handlers/test/lobby.js): отмена учителем и авто-закрытие пустого лобби
 * через 10 минут. SQL не выполняется (подставной `sql`), проверяем права и форму запросов.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SID = '33333333-3333-4333-8333-333333333333';

let queries = [];
let answer = () => [];
function sql(strings, ...values) {
  const text = strings.join('?').replace(/\s+/g, ' ').trim();
  queries.push({ text, values });
  return Promise.resolve(answer(text));
}

const mockBroadcast = jest.fn(async () => {});
jest.mock('../_handlers/test/_shared.js', () => ({
  broadcastTestFinished: (...args) => mockBroadcast(...args),
}));
jest.mock('../_log.js', () => ({
  log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));

const {
  cancelTest,
  closeIdleLobbies,
  closeLobby,
  LOBBY_IDLE_SEC,
} = require('../_handlers/test/lobby.js');

function res() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

beforeEach(() => {
  queries = [];
  answer = () => [];
  mockBroadcast.mockClear();
});

describe('cancel', () => {
  const run = async (body, method = 'POST') => {
    const r = res();
    await cancelTest({ method, body }, r, sql, ME);
    return r;
  };

  it('не POST — 405, без sessionId — 400', async () => {
    expect((await run({ sessionId: SID }, 'GET')).statusCode).toBe(405);
    expect((await run({})).statusCode).toBe(400);
  });

  it('чужое лобби — 403, ничего не меняем', async () => {
    answer = (t) =>
      t.startsWith('SELECT status') ? [{ status: 'waiting', engine: 2, teacher_id: OTHER }] : [];
    expect((await run({ sessionId: SID })).statusCode).toBe(403);
    expect(queries.some((q) => /UPDATE|DELETE/.test(q.text))).toBe(false);
  });

  it('идущий экзамен так не отменить — 409', async () => {
    answer = (t) =>
      t.startsWith('SELECT status') ? [{ status: 'active', engine: 2, teacher_id: ME }] : [];
    const r = await run({ sessionId: SID });
    expect(r.statusCode).toBe(409);
    expect(r.body.error).toBe('not_waiting');
  });

  it('экзамен в лобби → черновик, зашедшие удаляются, ученикам уходит test_finished', async () => {
    answer = (t) =>
      t.startsWith('SELECT status')
        ? [{ status: 'waiting', engine: 2, teacher_id: ME }]
        : t.startsWith('UPDATE test_sessions')
          ? [{ id: SID }]
          : [];
    const r = await run({ sessionId: SID });
    expect(r.body).toEqual({ ok: true, status: 'draft' });
    const upd = queries.find((q) => q.text.startsWith('UPDATE test_sessions'));
    expect(upd.text).toMatch(/status = 'draft'/);
    expect(upd.text).toMatch(/AND status = 'waiting'/);
    expect(upd.text).not.toMatch(/NOT EXISTS/);
    expect(queries.some((q) => q.text.startsWith('DELETE FROM test_participants'))).toBe(true);
    expect(mockBroadcast).toHaveBeenCalledWith(SID);
  });

  it('быстрый тест в лобби удаляется', async () => {
    answer = (t) =>
      t.startsWith('SELECT status')
        ? [{ status: 'waiting', engine: 1, teacher_id: ME }]
        : t.startsWith('DELETE FROM test_sessions')
          ? [{ id: SID }]
          : [];
    const r = await run({ sessionId: SID });
    expect(r.body).toEqual({ ok: true, status: 'deleted' });
  });

  it('уже закрытое — ok без изменений', async () => {
    answer = (t) =>
      t.startsWith('SELECT status') ? [{ status: 'draft', engine: 2, teacher_id: ME }] : [];
    expect((await run({ sessionId: SID })).body).toEqual({ ok: true, status: 'draft' });
    answer = () => [];
    expect((await run({ sessionId: SID })).body).toEqual({ ok: true, status: 'deleted' });
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

describe('авто-закрытие пустого лобби', () => {
  it('ищет только пустые лобби старше 10 минут', async () => {
    await closeIdleLobbies(sql, { teacherId: ME });
    const q = queries[0];
    expect(q.text).toMatch(/ts.status = 'waiting'/);
    expect(q.text).toMatch(/COALESCE\(ts.opened_at, ts.created_at\) < NOW\(\)/);
    expect(q.text).toMatch(/NOT EXISTS \(SELECT 1 FROM test_participants/);
    expect(q.values).toContain(LOBBY_IDLE_SEC);
    expect(LOBBY_IDLE_SEC).toBe(600);
  });

  it('закрывает с повторной проверкой «никто не зашёл» (ученик мог войти в ту же секунду)', async () => {
    answer = (t) => (t.startsWith('SELECT ts.id') ? [{ id: SID, engine: 2 }] : []);
    const n = await closeIdleLobbies(sql, { sessionId: SID });
    expect(n).toBe(0); // UPDATE ничего не вернул — кто-то зашёл
    const upd = queries.find((q) => q.text.startsWith('UPDATE test_sessions'));
    expect(upd.text).toMatch(/NOT EXISTS/);
    expect(queries.some((q) => q.text.startsWith('DELETE FROM test_participants'))).toBe(false);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it('без учителя и сессии ничего не делает; сбой базы не ломает запрос', async () => {
    expect(await closeIdleLobbies(sql, {})).toBe(0);
    expect(queries).toHaveLength(0);
    const broken = () => Promise.reject(new Error('column opened_at does not exist'));
    expect(await closeIdleLobbies(broken, { teacherId: ME })).toBe(0);
  });

  it('closeLobby: быстрый тест удаляется только если пустой', async () => {
    answer = (t) => (t.startsWith('DELETE FROM test_sessions') ? [{ id: SID }] : []);
    expect(await closeLobby(sql, SID, 1, { onlyEmpty: true })).toBe(true);
    expect(queries[0].text).toMatch(/NOT EXISTS/);
  });
});

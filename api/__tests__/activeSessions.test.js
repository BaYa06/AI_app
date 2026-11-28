/**
 * «Вернуться к идущему тесту» (plan/new/live_test_return.md, LiveReturn 1). SQL не выполняется
 * (подставной `sql`), проверяем права, форму запроса и границы «зависших» сессий.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const ME = '11111111-1111-4111-8111-111111111111';

let mockQueries = [];
let mockRows = [];
function mockSql(strings, ...values) {
  const text = strings.join('?').replace(/\s+/g, ' ').trim();
  mockQueries.push({ text, values });
  // Поиск пустых лобби для авто-закрытия (lobby.js) — в этих тестах их нет
  if (/FROM test_sessions ts WHERE ts.status = 'waiting'/.test(text)) return Promise.resolve([]);
  return Promise.resolve(mockRows);
}

jest.mock('@neondatabase/serverless', () => ({ neon: () => mockSql }));
jest.mock('../_db-init.js', () => ({ ensureDatabaseInitialized: async () => {} }));
jest.mock('../_log.js', () => ({
  log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

// Вход в test.js проверяется по SUPABASE_ANON_KEY, а babel-плагин встраивает process.env на этапе
// сборки — в jest ключа нет. Поэтому вызываем обработчик напрямую (как в access.test.js).
const call = async (method) => {
  const { getActiveSessions } = require('../_handlers/test/teacher.js');
  const res = mockRes();
  await getActiveSessions({ method, query: {} }, res, mockSql, ME);
  return res;
};

beforeEach(() => {
  mockQueries = [];
  mockRows = [];
});

describe('test?action=active (LiveReturn 1)', () => {
  it('не GET — 405', async () => {
    expect((await call('POST')).statusCode).toBe(405);
  });

  it('берёт только сессии этого учителя, без finished, с отсечкой по возрасту', async () => {
    mockRows = [{ sessionId: 's1', status: 'active' }];
    const res = await call('GET');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(mockRows);
    // Сначала закрываются пустые лобби старше 10 минут, затем — сам список
    expect(mockQueries[0].text).toMatch(/NOT EXISTS \(SELECT 1 FROM test_participants/);
    const q = mockQueries[mockQueries.length - 1];
    expect(q.values[0]).toBe(ME);
    expect(q.text).toMatch(/teacher_id = \?::uuid/);
    expect(q.text).toMatch(/status = 'waiting'/);
    expect(q.text).toMatch(/status = 'active'/);
    expect(q.text).not.toMatch(/finished/);
    expect(q.values).toEqual(expect.arrayContaining([6, 12]));
  });
});

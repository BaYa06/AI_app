/**
 * Права доступа в API (plan/new/code_cleanup.md, Clean 11).
 *
 * Сами права проверяет SQL (`WHERE user_id = …`), его здесь не выполнить. Проверяем то, что
 * зависит от кода: без входа — 401 и ни одного запроса; кривой id — 400; проверка прав получает
 * именно текущего пользователя; если проверка не нашла строку — разрушающий запрос
 * (DELETE/UPDATE/INSERT) не выполняется вообще, а клиент получает 403.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SET = '33333333-3333-4333-8333-333333333333';
const CARD = '44444444-4444-4444-8444-444444444444';
const SESSION = '55555555-5555-4555-8555-555555555555';

/** Подставной `sql`: пишет каждый запрос, отвечает строками по первому совпавшему правилу. */
let mockQueries = [];
let mockRules = [];
function mockSql(strings, ...values) {
  const text = strings.join('?').replace(/\s+/g, ' ').trim();
  mockQueries.push({ text, values });
  const rule = mockRules.find(([re]) => re.test(text));
  return Promise.resolve(rule ? rule[1](values) : []);
}
let mockUser = null;

jest.mock('@neondatabase/serverless', () => ({ neon: () => mockSql }));
jest.mock('../_db-init.js', () => ({ ensureDatabaseInitialized: async () => {} }));
jest.mock('../_realtime.js', () => ({ notifyCoursesChanged: async () => {} }));
jest.mock('../_log.js', () => ({
  log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));
jest.mock('../_auth.js', () => ({
  getAuthedUser: async () => mockUser,
  getAuthedUserId: async () => mockUser?.id ?? null,
  hasBearerSecret: () => false,
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (token) => ({
        data: { user: token === 'good' && mockUser ? { id: mockUser.id } : null },
        error: null,
      }),
    },
    channel: () => ({ subscribe: () => {}, send: async () => {}, unsubscribe: () => {} }),
    removeChannel: () => {},
  }),
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

const destructive = () => mockQueries.filter((q) => /^(DELETE|UPDATE|INSERT)\b/i.test(q.text));

beforeEach(() => {
  mockQueries = [];
  mockRules = [];
  mockUser = { id: ME };
});

describe('api/data', () => {
  const data = () => require('../data.js').default;

  it('без входа — 401 и ни одного запроса к БД', async () => {
    mockUser = null;
    const res = mockRes();
    await data()({ method: 'POST', query: { action: 'deleteSet' }, body: { setId: SET } }, res);
    expect(res.statusCode).toBe(401);
    expect(mockQueries).toEqual([]);
  });

  it('неизвестное действие — 400', async () => {
    const res = mockRes();
    await data()({ method: 'POST', query: { action: 'dropDatabase' }, body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(mockQueries).toEqual([]);
  });

  it('удалить чужой набор нельзя: 403, проверка — по текущему пользователю, DELETE не выполняется', async () => {
    mockRules = [[/^SELECT 1 FROM card_sets WHERE id = \?::uuid AND user_id = \?::uuid/, () => []]];
    const res = mockRes();
    await data()({ method: 'POST', query: { action: 'deleteSet' }, body: { setId: SET } }, res);
    expect(res.statusCode).toBe(403);
    const check = mockQueries.find((q) => /AND user_id = \?::uuid/.test(q.text));
    expect(check.values).toEqual([SET, ME]);
    expect(destructive()).toEqual([]);
  });

  it('свой набор удаляется: сначала проверка, потом DELETE карточек и набора', async () => {
    mockRules = [
      [/^SELECT 1 FROM card_sets WHERE id = \?::uuid AND user_id = \?::uuid/, () => [{}]],
    ];
    const res = mockRes();
    await data()({ method: 'POST', query: { action: 'deleteSet' }, body: { setId: SET } }, res);
    expect(res.statusCode).toBe(200);
    expect(destructive().map((q) => q.text.slice(0, 22))).toEqual([
      'DELETE FROM cards WHER',
      'DELETE FROM card_sets ',
    ]);
  });

  it('кривой id — 400 и никаких изменений', async () => {
    const res = mockRes();
    await data()(
      { method: 'POST', query: { action: 'deleteSet' }, body: { setId: 'x; DROP' } },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(destructive()).toEqual([]);
  });

  it('читать карточки чужого набора нельзя: 403, карточки не запрашиваются', async () => {
    mockRules = [[/^SELECT 1 FROM card_sets s WHERE s.id = \?::uuid/, () => []]];
    const res = mockRes();
    await data()({ method: 'GET', query: { action: 'loadCardsBySet', setId: SET } }, res);
    expect(res.statusCode).toBe(403);
    const check = mockQueries.find((q) => /FROM card_sets s WHERE/.test(q.text));
    expect(check.values).toEqual([SET, ME, ME, ME]);
    expect(mockQueries.some((q) => /FROM cards WHERE set_id/.test(q.text))).toBe(false);
  });

  it('удалить чужую карточку нельзя: DELETE только с условием «набор мой», ответ 403', async () => {
    mockRules = [[/^SELECT 1 FROM cards WHERE id/, () => [{}]]];
    const res = mockRes();
    await data()({ method: 'POST', query: { action: 'deleteCard' }, body: { cardId: CARD } }, res);
    expect(res.statusCode).toBe(403);
    const del = destructive();
    expect(del).toHaveLength(1);
    expect(del[0].text).toMatch(/s\.user_id = \?::uuid/);
    expect(del[0].values).toEqual([CARD, ME]);
  });
});

describe('api/test (экзамены)', () => {
  const test = () => require('../test.js').default;

  it('без токена — 401', async () => {
    const res = mockRes();
    await test()(
      { method: 'GET', headers: {}, query: { action: 'results', sessionId: SESSION } },
      res
    );
    expect(res.statusCode).toBe(401);
    expect(mockQueries).toEqual([]);
  });

  // Вход в test.js проверяется по SUPABASE_ANON_KEY, а babel-плагин встраивает process.env в коде на
  // этапе сборки (babel.config.cjs) — в jest ключа нет. Проверку владельца сессии вызываем напрямую.
  it('результаты чужой сессии — 403, участники не запрашиваются', async () => {
    const { getResults } = require('../_handlers/test/teacher.js');
    mockRules = [[/FROM test_sessions ts JOIN card_sets/, () => [{ teacher_id: OTHER }]]];
    const res = mockRes();
    await getResults({ method: 'GET', query: { sessionId: SESSION } }, res, mockSql, ME);
    expect(res.statusCode).toBe(403);
    expect(mockQueries.some((q) => /FROM test_participants/.test(q.text))).toBe(false);
  });

  it('результаты своей сессии — участники запрашиваются', async () => {
    const { getResults } = require('../_handlers/test/teacher.js');
    mockRules = [[/FROM test_sessions ts JOIN card_sets/, () => [{ teacher_id: ME }]]];
    const res = mockRes();
    await getResults({ method: 'GET', query: { sessionId: SESSION } }, res, mockSql, ME);
    expect(res.statusCode).toBe(200);
    expect(mockQueries.some((q) => /FROM test_participants/.test(q.text))).toBe(true);
  });
});

describe('api/library (публикация)', () => {
  const library = () => require('../library.js').default;

  it('публиковать может только админ: иначе 403 и ничего не пишется', async () => {
    mockRules = [[/^SELECT is_admin FROM users/, () => [{ is_admin: false }]]];
    const res = mockRes();
    await library()(
      { method: 'POST', headers: {}, query: { action: 'publish' }, body: { setId: SET } },
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'admins_only' });
    expect(destructive()).toEqual([]);
  });

  it('каталог без входа открывается (токен необязателен), «добавлено» считается для пустого пользователя', async () => {
    mockUser = null;
    const res = mockRes();
    await library()({ method: 'GET', headers: {}, query: { action: 'catalog' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, subjects: [], continue: null, books: [] });
    expect(destructive()).toEqual([]);
    // Запросы с «моими» отметками получают null, а не чужой id.
    const withMe = mockQueries.filter((q) => /\b(li|bi)\.user_id = \?::uuid/.test(q.text));
    expect(withMe.length).toBeGreaterThan(0);
    for (const q of withMe) expect(q.values).toContain(null);
  });

  it('каталог только на чтение: POST — 405 и ни одного запроса к каталогу', async () => {
    const res = mockRes();
    await library()({ method: 'POST', headers: {}, query: { action: 'subject' }, body: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(mockQueries.filter((q) => /library_subjects|library_collections/.test(q.text))).toEqual(
      []
    );
  });

  it('кривой предмет — 400 до запроса к базе, неизвестный — 404', async () => {
    let res = mockRes();
    await library()(
      { method: 'GET', headers: {}, query: { action: 'subject', subject: "x'; DROP" } },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(mockQueries).toEqual([]);

    res = mockRes();
    await library()(
      { method: 'GET', headers: {}, query: { action: 'subject', subject: 'nope' } },
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('лайк без входа — 401 и ни одного запроса', async () => {
    mockUser = null;
    const res = mockRes();
    await library()(
      { method: 'POST', headers: {}, query: { action: 'like' }, body: { librarySetId: SET } },
      res
    );
    expect(res.statusCode).toBe(401);
    expect(mockQueries).toEqual([]);
  });
});

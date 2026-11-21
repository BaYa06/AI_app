/**
 * Запросы NeonService (callTeacherApi, callDataApi, callProgressApi, buyStreakFreeze,
 * submitAnswers) и diamondStore (callRewardsApi) — plan/new/code_cleanup.md, Clean 5d.1.
 * Тест фиксирует HTTP-запрос побайтно (URL, метод, заголовки, тело, таймаут) и ветки результата
 * (нет токена / HTTP-ошибка / сеть / успех). Проходит и на коде до перевода на apiFetch.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetAccessToken = jest.fn<() => Promise<string | null>>();
jest.mock('@/services/auth/session', () => ({
  getAccessToken: () => mockGetAccessToken(),
}));
jest.mock('@/config/apiBase', () => ({ API_BASE: 'https://api.test/api' }));
jest.mock('@/services/localCache', () => ({
  readCache: () => undefined,
  writeCache: () => {},
}));
const mockLog = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('@/utils/logger', () => ({
  log: {
    debug: (...a: unknown[]) => mockLog.debug(...a),
    info: (...a: unknown[]) => mockLog.info(...a),
    warn: (...a: unknown[]) => mockLog.warn(...a),
    error: (...a: unknown[]) => mockLog.error(...a),
  },
}));
const mockSyncClaimed = jest.fn();
jest.mock('@/store/challengeStore', () => ({
  localDay: () => '2026-11-04',
  useChallengeStore: { getState: () => ({ syncClaimed: mockSyncClaimed }) },
}));

import { NeonService, NetworkLoadError } from '../NeonService';
import { useDiamondStore } from '@/store/diamondStore';

type FetchArgs = [string, RequestInit];
const mockFetch = jest.fn<(...args: FetchArgs) => Promise<Response>>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const AUTH_HEADERS = { 'Content-Type': 'application/json', Authorization: 'Bearer tok' };

/** Последний запрос: URL, метод, заголовки (с порядком ключей), тело, сигнал таймаута */
function lastRequest() {
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [url, init] = mockFetch.mock.calls[0];
  return { url, init };
}

function expectRequest(url: string, method: string, body: string | undefined) {
  const req = lastRequest();
  expect(req.url).toBe(url);
  expect(req.init.method).toBe(method);
  expect(req.init.headers).toEqual(AUTH_HEADERS);
  expect(Object.keys(req.init.headers as object)).toEqual(['Content-Type', 'Authorization']);
  expect(req.init.body).toBe(body);
  // fetchWithTimeout ставит свой сигнал
  expect(req.init.signal).toBeInstanceOf(AbortSignal);
  expect(Object.keys(req.init).sort()).toEqual(['body', 'headers', 'method', 'signal']);
}

function noLogs() {
  expect(mockLog.warn).not.toHaveBeenCalled();
  expect(mockLog.error).not.toHaveBeenCalled();
}

beforeEach(() => {
  mockGetAccessToken.mockReset();
  mockGetAccessToken.mockResolvedValue('tok');
  mockFetch.mockReset();
  (global as any).fetch = mockFetch;
  mockLog.warn.mockReset();
  mockLog.error.mockReset();
  mockSyncClaimed.mockReset();
});

describe('callTeacherApi', () => {
  it('GET: action + params в query, Content-Type и на GET, без тела', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { schedule: [{ id: 1 }] }));
    const res = await NeonService.getCourseSchedule('c 1');
    expectRequest(
      'https://api.test/api/teacher?action=get-schedule&courseId=c+1',
      'GET',
      undefined
    );
    expect(res).toEqual([{ id: 1 }]);
  });

  it('POST: тело JSON, успех — весь json', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { courseId: 'c', courseTitle: 'T' }));
    const res = await NeonService.joinCourseByCode('ABC', 'u');
    expectRequest('https://api.test/api/teacher?action=join-by-code', 'POST', '{"code":"ABC"}');
    expect(res).toEqual({ ok: true, courseId: 'c', courseTitle: 'T' });
  });

  it('нет токена — unauthorized, запроса нет', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    const res = await NeonService.joinCourseByCode('ABC', 'u');
    expect(res).toEqual({ ok: false, reason: 'unauthorized' });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLog.warn).toHaveBeenCalledWith(
      'Neon',
      'Failed to join course by code',
      'Not authenticated'
    );
  });

  it('HTTP-ошибка: reason из тела или по статусу, error из тела или HTTP N', async () => {
    mockFetch.mockResolvedValue(jsonResponse(410, { error: 'gone' }));
    expect(await NeonService.joinCourseByCode('A', 'u')).toEqual({ ok: false, reason: 'expired' });

    mockFetch.mockReset();
    mockFetch.mockResolvedValue(jsonResponse(400, { reason: 'own_course' }));
    expect(await NeonService.joinCourseByCode('A', 'u')).toEqual({
      ok: false,
      reason: 'own_course',
    });

    mockFetch.mockReset();
    mockFetch.mockResolvedValue(new Response('not json', { status: 403 }));
    expect(await NeonService.joinCourseByCode('A', 'u')).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(mockLog.warn).toHaveBeenLastCalledWith(
      'Neon',
      'Failed to join course by code',
      'HTTP 403'
    );
  });

  it('сеть: reason network, error — текст исходного исключения или Network error', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    expect(await NeonService.joinCourseByCode('A', 'u')).toEqual({ ok: false, reason: 'network' });
    expect(mockLog.warn).toHaveBeenLastCalledWith(
      'Neon',
      'Failed to join course by code',
      'Network request failed'
    );

    mockFetch.mockReset();
    mockFetch.mockRejectedValue({});
    await NeonService.joinCourseByCode('A', 'u');
    expect(mockLog.warn).toHaveBeenLastCalledWith(
      'Neon',
      'Failed to join course by code',
      'Network error'
    );
  });

  it('исключение токена летит наружу', async () => {
    const err = new Error('session down');
    mockGetAccessToken.mockRejectedValue(err);
    await expect(NeonService.joinCourseByCode('A', 'u')).rejects.toBe(err);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('callDataApi', () => {
  it('GET: params в query (null/undefined пропускаются), без тела, успех — json.data', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { data: [] }));
    await NeonService.loadCardsBySet('s/1');
    expectRequest('https://api.test/api/data?action=loadCardsBySet&setId=s%2F1', 'GET', undefined);

    mockFetch.mockReset();
    mockFetch.mockResolvedValue(jsonResponse(200, { data: { a: 1 } }));
    expect(await NeonService.getAboutMe()).toEqual({ a: 1 });
    expectRequest('https://api.test/api/data?action=getAboutMe', 'GET', undefined);
  });

  it('POST: params только в теле', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { data: true }));
    expect(await NeonService.updateDisplayName('u', 'Имя')).toBe(true);
    expectRequest(
      'https://api.test/api/data?action=updateDisplayName',
      'POST',
      '{"displayName":"Имя"}'
    );
  });

  it('нет токена — null без запроса и без логов', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    expect(await NeonService.getAboutMe()).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    noLogs();
  });

  it('HTTP-ошибка: 5xx — log.error, 4xx — log.warn, null', async () => {
    mockFetch.mockResolvedValue(jsonResponse(500, { error: 'boom' }));
    expect(await NeonService.getAboutMe()).toBeNull();
    expect(mockLog.error).toHaveBeenCalledWith('Neon', 'Data API getAboutMe failed', 500, 'boom');

    mockFetch.mockReset();
    mockFetch.mockResolvedValue(new Response('', { status: 404 }));
    expect(await NeonService.getAboutMe()).toBeNull();
    expect(mockLog.warn).toHaveBeenCalledWith('Neon', 'Data API getAboutMe failed', 404, undefined);
  });

  it('сеть: log.warn с исходным исключением, null', async () => {
    const err = new TypeError('Network request failed');
    mockFetch.mockRejectedValue(err);
    expect(await NeonService.getAboutMe()).toBeNull();
    expect(mockLog.warn).toHaveBeenCalledWith('Neon', 'Data API getAboutMe network error', err);
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it('strict: HTTP-ошибка — NetworkLoadError(action, status) без лога сети', async () => {
    mockFetch.mockResolvedValue(jsonResponse(503, {}));
    const p = NeonService.myFeedback();
    await expect(p).rejects.toBeInstanceOf(NetworkLoadError);
    await expect(p).rejects.toMatchObject({
      status: 503,
      message: 'Network load failed: myFeedback',
    });
    expectRequest('https://api.test/api/data?action=myFeedback', 'POST', '{}');
    expect(mockLog.error).toHaveBeenCalledTimes(1);
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  it('strict: сеть — log.warn + NetworkLoadError(action) со status 0', async () => {
    const err = new TypeError('offline');
    mockFetch.mockRejectedValue(err);
    const p = NeonService.myFeedback();
    await expect(p).rejects.toBeInstanceOf(NetworkLoadError);
    await expect(p).rejects.toMatchObject({ status: 0 });
    expect(mockLog.warn).toHaveBeenCalledWith('Neon', 'Data API myFeedback network error', err);
  });

  it('исключение токена летит наружу (не NetworkLoadError, без лога)', async () => {
    const err = new Error('session down');
    mockGetAccessToken.mockRejectedValue(err);
    await expect(NeonService.getAboutMe()).rejects.toBe(err);
    await expect(NeonService.myFeedback()).rejects.toBe(err);
    expect(mockFetch).not.toHaveBeenCalled();
    noLogs();
  });
});

describe('callProgressApi', () => {
  it('session-complete: сервер без заданий (400 Unknown action) — пустой итог, не null', async () => {
    mockFetch.mockResolvedValue(jsonResponse(400, { error: 'Unknown action' }));
    expect(await NeonService.reportHomeworkSession([{ cardId: 'c1', firstTry: true }])).toEqual({
      credited: 0,
      submitted: [],
    });
    noLogs();
  });

  it('session-complete: другая ошибка 400 и 500 — null (очередь повторит)', async () => {
    mockFetch.mockResolvedValue(jsonResponse(400, { error: 'cards required' }));
    expect(await NeonService.reportHomeworkSession([])).toBeNull();
    mockFetch.mockResolvedValue(jsonResponse(500, { error: 'Unknown action' }));
    expect(await NeonService.reportHomeworkSession([])).toBeNull();
  });

  it('GET: params в query, без тела, успех — весь json', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { enabled: false }));
    expect(await NeonService.loadLeaderboard('c1', 'previous')).toEqual({ enabled: false });
    expectRequest(
      'https://api.test/api/progress?action=leaderboard&courseId=c1&week=previous',
      'GET',
      undefined
    );
  });

  it('POST: тело JSON', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, {}));
    expect(await NeonService.setCourseRatingEnabled('c1', true)).toBe(true);
    expectRequest(
      'https://api.test/api/progress?action=rating-enabled',
      'POST',
      '{"courseId":"c1","enabled":true}'
    );
  });

  it('нет токена / HTTP-ошибка / сеть — null с теми же логами', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    expect(await NeonService.loadLeaderboard('c1')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    noLogs();

    mockGetAccessToken.mockResolvedValue('tok');
    mockFetch.mockResolvedValue(jsonResponse(403, { error: 'no' }));
    expect(await NeonService.loadLeaderboard('c1')).toBeNull();
    expect(mockLog.warn).toHaveBeenCalledWith('Neon', 'Progress API leaderboard failed', 403, 'no');

    mockFetch.mockReset();
    const err = new TypeError('offline');
    mockFetch.mockRejectedValue(err);
    expect(await NeonService.loadLeaderboard('c1')).toBeNull();
    expect(mockLog.warn).toHaveBeenLastCalledWith(
      'Neon',
      'Progress API leaderboard network error',
      err
    );
  });
});

describe('buyStreakFreeze', () => {
  it('запрос: POST, тело {} , успех — json.data', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { data: { diamonds: 1, streakFreezes: 2 } }));
    expect(await NeonService.buyStreakFreeze()).toEqual({ diamonds: 1, streakFreezes: 2 });
    expectRequest('https://api.test/api/data?action=buyStreakFreeze', 'POST', '{}');
  });

  it('409 — max_freezes / not_enough_diamonds, иное — unknown', async () => {
    mockFetch.mockResolvedValue(jsonResponse(409, { error: 'max_freezes' }));
    expect(await NeonService.buyStreakFreeze()).toEqual({ error: 'max_freezes' });
    mockFetch.mockResolvedValue(new Response('x', { status: 409 }));
    expect(await NeonService.buyStreakFreeze()).toEqual({ error: 'not_enough_diamonds' });
    mockFetch.mockResolvedValue(jsonResponse(500, {}));
    expect(await NeonService.buyStreakFreeze()).toEqual({ error: 'unknown' });
    noLogs();
  });

  it('нет токена / сеть — null без логов; исключение токена — наружу', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    expect(await NeonService.buyStreakFreeze()).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();

    mockGetAccessToken.mockResolvedValue('tok');
    mockFetch.mockRejectedValue(new TypeError('offline'));
    expect(await NeonService.buyStreakFreeze()).toBeNull();
    noLogs();

    const err = new Error('session down');
    mockGetAccessToken.mockRejectedValue(err);
    await expect(NeonService.buyStreakFreeze()).rejects.toBe(err);
  });
});

describe('submitAnswers', () => {
  const answers = [{ answerId: 'a', cardId: 'c', mode: 'test' as const, answeredAt: 1 }];

  it('запрос: POST progress?action=answer, тело {answers}, успех — json.results', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { results: [{ answerId: 'a' }] }));
    expect(await NeonService.submitAnswers(answers)).toEqual([{ answerId: 'a' }]);
    expectRequest(
      'https://api.test/api/progress?action=answer',
      'POST',
      JSON.stringify({ answers })
    );
  });

  it('400 — [] (не держим в очереди), 5xx — null + log.error', async () => {
    mockFetch.mockResolvedValue(jsonResponse(400, { error: 'bad' }));
    expect(await NeonService.submitAnswers(answers)).toEqual([]);
    expect(mockLog.warn).toHaveBeenCalledWith('Neon', 'Progress API failed', 400, 'bad');

    mockFetch.mockResolvedValue(jsonResponse(502, { error: 'down' }));
    expect(await NeonService.submitAnswers(answers)).toBeNull();
    expect(mockLog.error).toHaveBeenCalledWith('Neon', 'Progress API failed', 502, 'down');
  });

  it('нет токена — null без логов; сеть — null + log.warn', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    expect(await NeonService.submitAnswers(answers)).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    noLogs();

    mockGetAccessToken.mockResolvedValue('tok');
    const err = new TypeError('offline');
    mockFetch.mockRejectedValue(err);
    expect(await NeonService.submitAnswers(answers)).toBeNull();
    expect(mockLog.warn).toHaveBeenCalledWith('Neon', 'Progress API network error', err);
  });
});

describe('diamondStore callRewardsApi', () => {
  it('GET rewards: action и day в query, без тела', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { diamonds: 7, claimedToday: ['x'] }));
    await useDiamondStore.getState().loadRewards();
    expectRequest('https://api.test/api/push?action=rewards&day=2026-11-04', 'GET', undefined);
    expect(useDiamondStore.getState().diamonds).toBe(7);
    expect(mockSyncClaimed).toHaveBeenCalledWith(['x']);
  });

  it('POST claim-reward: тело {...body, day}, успех — json', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { diamonds: 9 }));
    expect(await useDiamondStore.getState().claimReward('streak' as any)).toBe(9);
    expectRequest(
      'https://api.test/api/push?action=claim-reward&day=2026-11-04',
      'POST',
      '{"challenge":"streak","day":"2026-11-04"}'
    );
  });

  it('нет токена / HTTP-ошибка — null без логов', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    expect(await useDiamondStore.getState().claimReward('streak' as any)).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();

    mockGetAccessToken.mockResolvedValue('tok');
    mockFetch.mockResolvedValue(jsonResponse(500, { diamonds: 1 }));
    expect(await useDiamondStore.getState().claimReward('streak' as any)).toBeNull();
    noLogs();
  });

  it('сеть и невалидный JSON при 2xx — null + log.error с исключением', async () => {
    const err = new TypeError('offline');
    mockFetch.mockRejectedValue(err);
    expect(await useDiamondStore.getState().claimReward('streak' as any)).toBeNull();
    expect(mockLog.error).toHaveBeenCalledWith('Rewards', 'Rewards API claim-reward failed', err);

    mockFetch.mockReset();
    mockFetch.mockResolvedValue(new Response('not json', { status: 200 }));
    expect(await useDiamondStore.getState().claimReward('streak' as any)).toBeNull();
    expect(mockLog.error).toHaveBeenLastCalledWith(
      'Rewards',
      'Rewards API claim-reward failed',
      expect.objectContaining({ name: 'SyntaxError' })
    );
  });
});

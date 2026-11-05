/**
 * Запросы LibraryService, BookService, ShareService, AiImportService, push (web и native) и
 * pushPrompt — plan/new/code_cleanup.md, Clean 5d.2. Тест фиксирует HTTP-запрос (URL, метод,
 * заголовки с порядком ключей, тело, таймаут/сигнал) и ветки результата (нет токена / HTTP-ошибка /
 * сеть / успех). Проходит и на коде до перевода на apiFetch.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

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
jest.mock('@/utils', () => ({ pluralize: () => 'карточек' }));

let mockOS = 'ios';
jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockOS;
    },
  },
  Share: { share: () => {}, dismissedAction: 'dismissed' },
  Clipboard: { setString: () => {} },
}));

// web push (firebase JS SDK)
const mockWebGetToken = jest.fn<() => Promise<string>>();
jest.mock('firebase/messaging', () => ({
  getMessaging: () => ({}),
  getToken: () => mockWebGetToken(),
  onMessage: () => () => {},
  isSupported: async () => true,
}));
jest.mock('@/services/firebase', () => ({ app: {} }));

// native push (@react-native-firebase)
const mockNativeGetToken = jest.fn<() => Promise<string>>();
jest.mock('@react-native-firebase/app', () => ({ getApp: () => ({}) }));
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: () => ({}),
  getToken: () => mockNativeGetToken(),
  deleteToken: async () => {},
  requestPermission: async () => 1,
  hasPermission: async () => 1,
  onMessage: () => () => {},
  onTokenRefresh: () => () => {},
  getInitialNotification: async () => null,
  onNotificationOpenedApp: () => () => {},
  AuthorizationStatus: { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 },
}));
jest.mock('@/services/StorageService', () => ({
  StorageService: { getString: () => undefined, setString: () => {} },
}));
jest.mock('@/services/analytics', () => ({ Analytics: { pushPermissionRevoked: () => {} } }));

import { LibraryService } from '../LibraryService';
import { BookService } from '../BookService';
import { ShareService, ShareApiError } from '../ShareService';
import { AiImportError, getAiUsage, importFiles } from '../AiImportService';
import { saveReminderHour } from '../pushPrompt';
import { version as APP_VERSION } from '../../../package.json';

type FetchArgs = [string, RequestInit];
const mockFetch = jest.fn<(...args: FetchArgs) => Promise<Response>>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(status: number, text: string): Response {
  return new Response(text, { status });
}

const CT = { 'Content-Type': 'application/json' };
const CT_AUTH = { 'Content-Type': 'application/json', Authorization: 'Bearer tok' };

/**
 * Проверка одного запроса. `timeout` — число мс (fetchWithTimeout: свой AbortSignal и setTimeout с
 * этим временем) или false (голый fetch: без signal). Метод GET допускается и явным, и по умолчанию
 * (undefined) — это один и тот же HTTP-запрос.
 */
function expectRequest(
  call: number,
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeout: number | false
) {
  const [reqUrl, init] = mockFetch.mock.calls[call];
  expect(reqUrl).toBe(url);
  expect(init.method ?? 'GET').toBe(method);
  expect(init.headers).toEqual(headers);
  expect(Object.keys(init.headers as object)).toEqual(Object.keys(headers));
  expect(init.body).toBe(body);
  if (timeout === false) {
    expect(init.signal).toBeUndefined();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  } else {
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(setTimeoutSpy.mock.calls.map((c) => c[1])).toContain(timeout);
  }
}

let setTimeoutSpy: jest.SpiedFunction<typeof setTimeout>;

beforeEach(() => {
  mockGetAccessToken.mockReset();
  mockGetAccessToken.mockResolvedValue('tok');
  mockFetch.mockReset();
  (global as any).fetch = mockFetch;
  mockLog.warn.mockReset();
  mockLog.error.mockReset();
  setTimeoutSpy = jest.spyOn(global, 'setTimeout');
});

afterEach(() => {
  setTimeoutSpy.mockRestore();
});

// ==================== LibraryService ====================

describe('LibraryService.callLibraryApi', () => {
  it('GET без токена: пустые/undefined параметры пропущены, порядок как в фильтрах, без Authorization', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    mockFetch.mockResolvedValue(jsonResponse(200, { sets: [], total: 0 }));
    const res = await LibraryService.getLibrarySets({
      search: '',
      category: 'lang a',
      cardsMin: 0,
    } as any);
    expectRequest(
      0,
      'https://api.test/api/library?category=lang+a&sort=popular&cardsMin=0&page=1',
      'GET',
      CT,
      undefined,
      20_000
    );
    expect(res).toEqual({ sets: [], total: 0 });
  });

  it('GET с токеном: Authorization после Content-Type', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { id: 'x' }));
    await LibraryService.getLibrarySetDetail('x');
    expectRequest(0, 'https://api.test/api/library?id=x', 'GET', CT_AUTH, undefined, 20_000);
  });

  it('POST requireAuth: тело JSON, успех — поле ответа', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { newSetId: 'n1', extra: 1 }));
    const res = await LibraryService.importSet('u', 'L1', 'c1');
    expectRequest(
      0,
      'https://api.test/api/library?action=import',
      'POST',
      CT_AUTH,
      '{"librarySetId":"L1","courseId":"c1"}',
      20_000
    );
    expect(res).toEqual({ newSetId: 'n1' });
  });

  it('PUT и DELETE', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { success: true }));
    await LibraryService.updatePublication('u', 'L1', { category: 'c' });
    expectRequest(
      0,
      'https://api.test/api/library?action=publish',
      'PUT',
      CT_AUTH,
      '{"librarySetId":"L1","category":"c"}',
      20_000
    );
    mockFetch.mockClear();
    mockFetch.mockResolvedValue(jsonResponse(200, { success: true }));
    await LibraryService.unpublishSet('u', 'L1');
    expectRequest(
      0,
      'https://api.test/api/library?action=publish',
      'DELETE',
      CT_AUTH,
      '{"librarySetId":"L1"}',
      20_000
    );
  });

  it('requireAuth без токена — Error, запроса нет', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    await expect(LibraryService.canPublish()).rejects.toThrow('Необходимо войти в аккаунт');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('исключение getAccessToken летит наружу', async () => {
    const boom = new Error('session');
    mockGetAccessToken.mockRejectedValue(boom);
    await expect(LibraryService.getLibrarySetDetail('x')).rejects.toBe(boom);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('HTTP: 403 — своё сообщение, иначе error из тела или HTTP N', async () => {
    mockFetch.mockResolvedValue(jsonResponse(403, { error: 'x' }));
    await expect(LibraryService.importSet('u', 'L', 'c')).rejects.toThrow(
      'Можно добавлять только в свои курсы'
    );
    mockFetch.mockResolvedValue(jsonResponse(400, { error: 'bad' }));
    await expect(LibraryService.importSet('u', 'L', 'c')).rejects.toThrow('bad');
    mockFetch.mockResolvedValue(textResponse(500, 'oops'));
    await expect(LibraryService.importSet('u', 'L', 'c')).rejects.toThrow('HTTP 500');
  });

  it('сеть — исходное исключение fetch', async () => {
    const netErr = new TypeError('Network request failed');
    mockFetch.mockRejectedValue(netErr);
    await expect(LibraryService.getLibrarySetDetail('x')).rejects.toBe(netErr);
  });

  it('успех с не-JSON телом — {}', async () => {
    mockFetch.mockResolvedValue(textResponse(200, 'not json'));
    expect(await LibraryService.canPublish()).toBe(false);
  });
});

// ==================== BookService ====================

describe('BookService.callBooksApi', () => {
  it('GET: action + params в query, Content-Type и на GET', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { books: [{ id: 'b' }] }));
    const res = await BookService.listBooks({ subject: 'en', q: 'a b' } as any);
    expectRequest(
      0,
      'https://api.test/api/books?action=list-books&subject=en&q=a+b',
      'GET',
      CT_AUTH,
      undefined,
      20_000
    );
    expect(res).toEqual([{ id: 'b' }]);
  });

  it('POST: тело JSON, успех — { ok, data }', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { ok: true }));
    const res = await BookService.detachFromCourse('b1', 'c1');
    expectRequest(
      0,
      'https://api.test/api/books?action=detach-from-course',
      'POST',
      CT_AUTH,
      '{"bookId":"b1","courseId":"c1"}',
      20_000
    );
    expect(res).toEqual({ ok: true, data: { ok: true } });
  });

  it('нет токена — 401 Not authenticated, запроса нет', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    expect(await BookService.detachFromCourse('b', 'c')).toEqual({
      ok: false,
      error: 'Not authenticated',
      status: 401,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('HTTP-ошибка: error из тела или HTTP N, статус ответа', async () => {
    mockFetch.mockResolvedValue(jsonResponse(403, { error: 'forbidden' }));
    expect(await BookService.detachFromCourse('b', 'c')).toEqual({
      ok: false,
      error: 'forbidden',
      status: 403,
    });
    mockFetch.mockResolvedValue(textResponse(502, 'bad gateway'));
    expect(await BookService.detachFromCourse('b', 'c')).toEqual({
      ok: false,
      error: 'HTTP 502',
      status: 502,
    });
  });

  it('сеть — status 0, текст исключения; не-Error — Network error', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    expect(await BookService.detachFromCourse('b', 'c')).toEqual({
      ok: false,
      error: 'Network request failed',
      status: 0,
    });
    mockFetch.mockRejectedValue('weird');
    expect(await BookService.detachFromCourse('b', 'c')).toEqual({
      ok: false,
      error: 'Network error',
      status: 0,
    });
  });

  it('ошибка listBooks — [] и warn с текстом', async () => {
    mockFetch.mockResolvedValue(jsonResponse(500, { error: 'db' }));
    expect(await BookService.listBooks()).toEqual([]);
    expect(mockLog.warn).toHaveBeenCalledWith('BookService', 'listBooks failed', 'db');
  });
});

// ==================== ShareService ====================

describe('ShareService.callShareApi', () => {
  it('GET без токена — без Authorization', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    mockFetch.mockResolvedValue(jsonResponse(200, { code: 'AB', cards: [] }));
    const res = await ShareService.preview('A B');
    expectRequest(
      0,
      'https://api.test/api/share?action=preview&code=A+B',
      'GET',
      CT,
      undefined,
      20_000
    );
    expect(res).toEqual({ code: 'AB', cards: [] });
  });

  it('GET без params и POST с токеном', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { blocks: [1] }));
    expect(await ShareService.listBlocks()).toEqual([1]);
    expectRequest(0, 'https://api.test/api/share?action=blocks', 'GET', CT_AUTH, undefined, 20_000);
    mockFetch.mockClear();
    mockFetch.mockResolvedValue(jsonResponse(200, { code: 'C', url: 'u' }));
    expect(await ShareService.createLink('s1')).toEqual({ code: 'C', url: 'u' });
    expectRequest(
      0,
      'https://api.test/api/share?action=create',
      'POST',
      CT_AUTH,
      '{"setId":"s1"}',
      20_000
    );
  });

  it('HTTP-ошибка — ShareApiError(code, status, payload)', async () => {
    mockFetch.mockResolvedValue(jsonResponse(409, { error: 'already_imported', setId: 'x' }));
    const err = (await ShareService.importSet('C', null).catch((e) => e)) as ShareApiError;
    expect(err).toBeInstanceOf(ShareApiError);
    expect(err.code).toBe('already_imported');
    expect(err.message).toBe('already_imported');
    expect(err.status).toBe(409);
    expect(err.payload).toEqual({ error: 'already_imported', setId: 'x' });

    mockFetch.mockResolvedValue(textResponse(500, 'oops'));
    const err2 = (await ShareService.importSet('C', null).catch((e) => e)) as ShareApiError;
    expect(err2.code).toBe('http_500');
    expect(err2.payload).toEqual({});
  });

  it('сеть — исходное исключение fetch', async () => {
    const netErr = new TypeError('Network request failed');
    mockFetch.mockRejectedValue(netErr);
    await expect(ShareService.preview('C')).rejects.toBe(netErr);
  });
});

// ==================== AiImportService ====================

describe('AiImportService', () => {
  const request = {
    files: [
      { id: '1', name: 'a.jpg', kind: 'image', mimeType: 'image/jpeg', base64: 'AAA' },
      { id: '2', name: 't.txt', kind: 'text', mimeType: 'text/plain', content: 'hi' },
    ],
    goal: 'vocab',
    prompt: '  ',
    languageFrom: 'en',
  } as any;
  const expectedBody = JSON.stringify({
    files: [
      { type: 'binary', name: 'a.jpg', mimeType: 'image/jpeg', base64: 'AAA' },
      { type: 'text', name: 't.txt', mimeType: 'text/plain', content: 'hi' },
    ],
    goal: 'vocab',
    languageFrom: 'en',
  });

  it('importFiles: POST, 120 с, внешний signal связан с запросом, успех нормализован', async () => {
    const controller = new AbortController();
    let linked = false;
    mockFetch.mockImplementation(async (_url, init) => {
      controller.abort();
      linked = (init.signal as AbortSignal).aborted;
      return jsonResponse(200, { cards: [{ front: 'a', back: 'b' }], lang: 'en' });
    });
    const res = await importFiles(request, controller.signal);
    expectRequest(
      0,
      'https://api.test/api/ai?fn=import-files',
      'POST',
      CT_AUTH,
      expectedBody,
      120_000
    );
    expect(linked).toBe(true);
    expect(res).toEqual({
      cards: [{ front: 'a', back: 'b' }],
      suggestedTitle: '',
      kind: 'vocab',
      lang: 'en',
      excerpt: undefined,
      usage: undefined,
    });
  });

  it('importFiles без signal', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, {}));
    await importFiles(request);
    expectRequest(
      0,
      'https://api.test/api/ai?fn=import-files',
      'POST',
      CT_AUTH,
      expectedBody,
      120_000
    );
  });

  it('importFiles: нет токена — unauthorized, запроса нет; исключение сессии — наружу', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    const err = (await importFiles(request).catch((e) => e)) as AiImportError;
    expect(err).toBeInstanceOf(AiImportError);
    expect(err.code).toBe('unauthorized');
    expect(mockFetch).not.toHaveBeenCalled();

    const boom = new Error('session');
    mockGetAccessToken.mockRejectedValue(boom);
    await expect(importFiles(request)).rejects.toBe(boom);
  });

  it('importFiles: отмена — cancelled, таймаут/сеть — network', async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(async () => {
      controller.abort();
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    });
    const err = (await importFiles(request, controller.signal).catch((e) => e)) as AiImportError;
    expect(err.code).toBe('cancelled');

    mockFetch.mockReset();
    mockFetch.mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    const err2 = (await importFiles(request, new AbortController().signal).catch(
      (e) => e
    )) as AiImportError;
    expect(err2.code).toBe('network');

    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    const err3 = (await importFiles(request).catch((e) => e)) as AiImportError;
    expect(err3.code).toBe('network');
  });

  it('importFiles: HTTP-ошибки через toAiError (тело читается)', async () => {
    mockFetch.mockResolvedValue(jsonResponse(429, { error: 'daily_limit', resetAt: 'R' }));
    const e1 = (await importFiles(request).catch((e) => e)) as AiImportError;
    expect([e1.code, e1.resetAt]).toEqual(['daily_limit', 'R']);

    mockFetch.mockResolvedValue(jsonResponse(429, { retryAfter: 7 }));
    const e2 = (await importFiles(request).catch((e) => e)) as AiImportError;
    expect([e2.code, e2.retryAfter]).toEqual(['ai_busy', 7]);

    mockFetch.mockResolvedValue(jsonResponse(500, { error: 'boom' }));
    const e3 = (await importFiles(request).catch((e) => e)) as AiImportError;
    expect([e3.code, e3.detail]).toEqual(['server', '500 · boom']);

    mockFetch.mockResolvedValue(textResponse(413, 'too big'));
    const e4 = (await importFiles(request).catch((e) => e)) as AiImportError;
    expect(e4.code).toBe('too_large');
  });

  it('importFiles: невалидный JSON успеха — исключение разбора (не AiImportError)', async () => {
    mockFetch.mockResolvedValue(textResponse(200, 'not json'));
    const err = await importFiles(request).catch((e) => e);
    // SyntaxError из другого realm (undici) — сверяем по имени
    expect(err).not.toBeInstanceOf(AiImportError);
    expect(err.name).toBe('SyntaxError');
  });

  it('getAiUsage: GET, только Authorization, 15 с', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { used: 1, limit: 5, resetAt: 'R' }));
    expect(await getAiUsage()).toEqual({ used: 1, limit: 5, resetAt: 'R' });
    expectRequest(
      0,
      'https://api.test/api/ai?fn=usage',
      'GET',
      { Authorization: 'Bearer tok' },
      undefined,
      15_000
    );
  });

  it('getAiUsage: нет токена / исключение сессии / !ok / сеть / не-JSON — null', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    expect(await getAiUsage()).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();

    mockGetAccessToken.mockRejectedValue(new Error('session'));
    expect(await getAiUsage()).toBeNull();

    mockGetAccessToken.mockResolvedValue('tok');
    mockFetch.mockResolvedValue(jsonResponse(500, { used: 1 }));
    expect(await getAiUsage()).toBeNull();
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    expect(await getAiUsage()).toBeNull();
    mockFetch.mockResolvedValue(textResponse(200, 'not json'));
    expect(await getAiUsage()).toBeNull();
  });
});

// ==================== pushPrompt.saveReminderHour ====================

describe('pushPrompt.saveReminderHour', () => {
  const URL_SETTINGS = 'https://api.test/api/push?action=settings';

  it('GET (только Authorization) → POST (Authorization перед Content-Type), голый fetch', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(200, { notifDays: 'mon,tue', notifStreak: false }))
      .mockResolvedValueOnce(jsonResponse(200, {}));
    expect(await saveReminderHour(19)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expectRequest(0, URL_SETTINGS, 'GET', { Authorization: 'Bearer tok' }, undefined, false);
    expectRequest(
      1,
      URL_SETTINGS,
      'POST',
      { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
      JSON.stringify({
        notifEnabled: true,
        notifHour: 19,
        notifMinute: 0,
        notifDays: 'mon,tue',
        notifDaysExplicit: true,
        notifStreak: false,
        notifTimeExplicit: true,
      }),
      false
    );
  });

  it('GET-ошибка не проверяется по статусу; дни по умолчанию; POST !ok → false', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(500, { error: 'x' }))
      .mockResolvedValueOnce(jsonResponse(500, {}));
    expect(await saveReminderHour(9)).toBe(false);
    expect(mockFetch.mock.calls[1][1].body).toBe(
      JSON.stringify({
        notifEnabled: true,
        notifHour: 9,
        notifMinute: 0,
        notifDaysExplicit: false,
        notifStreak: true,
        notifTimeExplicit: true,
      })
    );
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  it('нет токена — false без запросов', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    expect(await saveReminderHour(9)).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('не-JSON на GET / сеть на POST / исключение сессии — false + warn', async () => {
    mockFetch.mockResolvedValueOnce(textResponse(200, 'nope'));
    expect(await saveReminderHour(9)).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockLog.warn).toHaveBeenCalledTimes(1);
    expect(mockLog.warn.mock.calls[0].slice(0, 2)).toEqual(['PushPrompt', 'save hour failed']);
    expect((mockLog.warn.mock.calls[0][2] as Error).name).toBe('SyntaxError');

    const netErr = new TypeError('Network request failed');
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {})).mockRejectedValueOnce(netErr);
    expect(await saveReminderHour(9)).toBe(false);
    expect(mockLog.warn).toHaveBeenLastCalledWith('PushPrompt', 'save hour failed', netErr);

    const boom = new Error('session');
    mockGetAccessToken.mockRejectedValue(boom);
    expect(await saveReminderHour(9)).toBe(false);
    expect(mockLog.warn).toHaveBeenLastCalledWith('PushPrompt', 'save hour failed', boom);
  });
});

// ==================== push (native) ====================

type NativePush = typeof import('../pushNotifications.native');

function loadNativePush(): NativePush {
  mockOS = 'ios';
  let mod!: NativePush;
  jest.isolateModules(() => {
    mod = require('../pushNotifications.native');
  });
  return mod;
}

describe('pushNotifications.native: subscribe/unsubscribe', () => {
  beforeEach(() => {
    mockNativeGetToken.mockReset();
    mockNativeGetToken.mockResolvedValue('fcm-n');
  });

  it('subscribe: POST на API_BASE/push, Content-Type + Authorization, голый fetch', async () => {
    const push = loadNativePush();
    mockFetch.mockResolvedValue(jsonResponse(200, {}));
    expect(await push.requestPushPermission('u1')).toEqual({
      permission: 'granted',
      token: 'fcm-n',
      isSupported: true,
    });
    expectRequest(
      0,
      'https://api.test/api/push?action=subscribe',
      'POST',
      CT_AUTH,
      JSON.stringify({
        token: 'fcm-n',
        platform: 'ios',
        userId: 'u1',
        permission: 'granted',
        appVersion: APP_VERSION,
      }),
      false
    );
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  it('subscribe без токена входа — без Authorization; !ok — warn со статусом', async () => {
    const push = loadNativePush();
    mockGetAccessToken.mockResolvedValue(null);
    mockFetch.mockResolvedValue(jsonResponse(500, {}));
    await push.requestPushPermission('u1');
    expect(mockFetch.mock.calls[0][1].headers).toEqual(CT);
    expect(mockLog.warn).toHaveBeenCalledWith('Push', 'Backend subscribe failed', 500);
  });

  it('subscribe: сеть и исключение сессии — warn с исключением, наружу не летит', async () => {
    const push = loadNativePush();
    const netErr = new TypeError('Network request failed');
    mockFetch.mockRejectedValue(netErr);
    expect((await push.requestPushPermission('u1')).token).toBe('fcm-n');
    expect(mockLog.warn).toHaveBeenCalledWith('Push', 'Failed to send token to backend', netErr);

    const push2 = loadNativePush();
    const boom = new Error('session');
    mockGetAccessToken.mockRejectedValue(boom);
    mockLog.warn.mockReset();
    expect((await push2.requestPushPermission('u1')).token).toBe('fcm-n');
    expect(mockLog.warn).toHaveBeenCalledWith('Push', 'Failed to send token to backend', boom);
  });

  it('unsubscribe: POST {token}; !ok и сеть — warn', async () => {
    const push = loadNativePush();
    mockFetch.mockResolvedValue(jsonResponse(200, {}));
    expect(await push.unsubscribePush()).toBe(true);
    expectRequest(
      0,
      'https://api.test/api/push?action=unsubscribe',
      'POST',
      CT_AUTH,
      '{"token":"fcm-n"}',
      false
    );

    mockFetch.mockReset();
    mockFetch.mockResolvedValue(jsonResponse(404, {}));
    expect(await push.unsubscribePush()).toBe(true);
    expect(mockLog.warn).toHaveBeenCalledWith('Push', 'Backend unsubscribe failed', 404);

    const netErr = new TypeError('Network request failed');
    mockFetch.mockRejectedValue(netErr);
    expect(await push.unsubscribePush()).toBe(true);
    expect(mockLog.warn).toHaveBeenCalledWith(
      'Push',
      'Failed to remove token from backend',
      netErr
    );
  });
});

// ==================== push (web) ====================

type WebPush = typeof import('../pushNotifications');

const store = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => {
    store.set(k, String(v));
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
};

function loadWebPush(): WebPush {
  mockOS = 'web';
  process.env.FIREBASE_VAPID_KEY = 'vapid-key-1234567890';
  const FakeNotification = { permission: 'granted', requestPermission: async () => 'granted' };
  (global as any).Notification = FakeNotification;
  (global as any).window = { Notification: FakeNotification };
  (global as any).localStorage = fakeLocalStorage;
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      serviceWorker: {
        getRegistrations: async () => [{ active: { scriptURL: 'https://x/sw.js' } }],
      },
    },
    configurable: true,
    writable: true,
  });
  let mod!: WebPush;
  jest.isolateModules(() => {
    mod = require('../pushNotifications');
  });
  return mod;
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

describe('pushNotifications (web): subscribe/unsubscribe', () => {
  const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  beforeEach(() => {
    store.clear();
    mockWebGetToken.mockReset();
    mockWebGetToken.mockResolvedValue('fcm-w');
  });

  afterEach(() => {
    delete (global as any).window;
    delete (global as any).Notification;
    delete (global as any).localStorage;
    if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
    else delete (globalThis as any).navigator;
  });

  it('subscribe: относительный /api/push, тело, голый fetch; успех — версия в localStorage', async () => {
    const push = loadWebPush();
    mockFetch.mockResolvedValue(jsonResponse(200, {}));
    expect(await push.refreshPushToken('u1')).toBe('fcm-w');
    await flush();
    expectRequest(
      0,
      '/api/push?action=subscribe',
      'POST',
      CT_AUTH,
      JSON.stringify({ token: 'fcm-w', platform: 'web', userId: 'u1', appVersion: APP_VERSION }),
      false
    );
    expect(store.get('fcm_token_app_version')).toBe(APP_VERSION);
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  it('subscribe без токена входа — без Authorization; !ok — warn, версия не сохранена', async () => {
    const push = loadWebPush();
    mockGetAccessToken.mockResolvedValue(null);
    mockFetch.mockResolvedValue(jsonResponse(500, {}));
    await push.refreshPushToken(null);
    await flush();
    expect(mockFetch.mock.calls[0][1].headers).toEqual(CT);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string).userId).toBeNull();
    expect(mockLog.warn).toHaveBeenCalledWith('Push', 'Backend subscribe failed', 500);
    expect(store.has('fcm_token_app_version')).toBe(false);
  });

  it('subscribe: сеть и исключение сессии — warn с исключением', async () => {
    const push = loadWebPush();
    const netErr = new TypeError('Failed to fetch');
    mockFetch.mockRejectedValue(netErr);
    await push.refreshPushToken('u1');
    await flush();
    expect(mockLog.warn).toHaveBeenCalledWith('Push', 'Failed to send token to backend', netErr);

    store.clear();
    const push2 = loadWebPush();
    const boom = new Error('session');
    mockGetAccessToken.mockRejectedValue(boom);
    mockLog.warn.mockReset();
    await push2.refreshPushToken('u1');
    await flush();
    expect(mockLog.warn).toHaveBeenCalledWith('Push', 'Failed to send token to backend', boom);
  });

  it('unsubscribe: POST {token}; !ok и сеть — warn', async () => {
    const push = loadWebPush();
    store.set('flashly_fcm_token', 'stored-t');
    mockFetch.mockResolvedValue(jsonResponse(200, {}));
    expect(await push.unsubscribePush()).toBe(true);
    expectRequest(
      0,
      '/api/push?action=unsubscribe',
      'POST',
      CT_AUTH,
      '{"token":"stored-t"}',
      false
    );
    expect(store.has('flashly_fcm_token')).toBe(false);

    mockFetch.mockReset();
    store.set('flashly_fcm_token', 'stored-t');
    mockFetch.mockResolvedValue(jsonResponse(404, {}));
    expect(await push.unsubscribePush()).toBe(true);
    expect(mockLog.warn).toHaveBeenCalledWith('Push', 'Backend unsubscribe failed', 404);

    store.set('flashly_fcm_token', 'stored-t');
    const netErr = new TypeError('Failed to fetch');
    mockFetch.mockRejectedValue(netErr);
    expect(await push.unsubscribePush()).toBe(true);
    expect(mockLog.warn).toHaveBeenCalledWith(
      'Push',
      'Failed to remove token from backend',
      netErr
    );
  });
});

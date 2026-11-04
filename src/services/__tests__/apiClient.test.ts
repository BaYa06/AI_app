import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetAccessToken = jest.fn<() => Promise<string | null>>();
jest.mock('@/services/auth/session', () => ({
  getAccessToken: () => mockGetAccessToken(),
}));
jest.mock('@/config/apiBase', () => ({ API_BASE: 'https://api.test/api' }));

import { ApiError, apiFetch, buildApiUrl } from '../api/client';

type FetchArgs = [string, RequestInit];
const mockFetch = jest.fn<(...args: FetchArgs) => Promise<Response>>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** fetch, который висит, пока его не отменят через signal */
function hangingFetch(_url: string, init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const fail = () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      reject(err);
    };
    if (init.signal?.aborted) fail();
    init.signal?.addEventListener('abort', fail);
  });
}

beforeEach(() => {
  mockGetAccessToken.mockReset();
  mockGetAccessToken.mockResolvedValue('tok');
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(jsonResponse(200, { data: 1 }));
  (global as any).fetch = mockFetch;
});

describe('buildApiUrl / query', () => {
  it('база API_BASE + endpoint + query в порядке ключей', async () => {
    await apiFetch('data', { query: { action: 'getUserStats', b: 2, a: 'x y' } });
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.test/api/data?action=getUserStats&b=2&a=x+y'
    );
  });

  it('undefined/null пропускаются, пустой query — без «?»', () => {
    expect(buildApiUrl('library', { a: undefined, b: null })).toBe('https://api.test/api/library');
    expect(buildApiUrl('library')).toBe('https://api.test/api/library');
    expect(buildApiUrl('library', { a: '', b: false, c: 0 })).toBe(
      'https://api.test/api/library?a=&b=false&c=0'
    );
  });

  it('URLSearchParams берётся как есть', () => {
    const q = new URLSearchParams({ action: 'x', v: 'undefined' });
    expect(buildApiUrl('teacher', q)).toBe('https://api.test/api/teacher?action=x&v=undefined');
  });

  it('baseUrl для web-push и абсолютный URL', () => {
    expect(buildApiUrl('push', { action: 'subscribe' }, '/api')).toBe('/api/push?action=subscribe');
    expect(buildApiUrl('https://other.test/x?y=1', { z: 2 })).toBe('https://other.test/x?y=1&z=2');
  });
});

describe('тело и заголовки', () => {
  it('POST с телом: JSON + Content-Type + Authorization', async () => {
    await apiFetch('data', { method: 'POST', query: { action: 'a' }, body: { x: 1 } });
    const init = mockFetch.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"x":1}');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok',
    });
  });

  it('пустой объект — тело "{}"', async () => {
    await apiFetch('data', { method: 'POST', body: {} });
    expect(mockFetch.mock.calls[0][1].body).toBe('{}');
  });

  it('GET без тела — без Content-Type; свои заголовки добавляются', async () => {
    await apiFetch('ai', { query: { fn: 'usage' } });
    expect(mockFetch.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer tok' });
    expect(mockFetch.mock.calls[0][1].body).toBeUndefined();

    await apiFetch('data', { headers: { 'Content-Type': 'application/json' } });
    expect(mockFetch.mock.calls[1][1].headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok',
    });
  });

  it('никаких лишних заголовков', async () => {
    await apiFetch('data', { method: 'POST', body: { a: 1 }, auth: 'none' });
    expect(Object.keys(mockFetch.mock.calls[0][1].headers as object)).toEqual(['Content-Type']);
  });
});

describe('токен', () => {
  it('required без токена — запроса нет, no_token', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    const res = await apiFetch('data');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    expect(res.response).toBeNull();
    expect(res.error).toBeInstanceOf(ApiError);
    expect(res.error?.code).toBe('no_token');
  });

  it('optional без токена — запрос без Authorization', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    const res = await apiFetch('library', { auth: 'optional' });
    expect(res.ok).toBe(true);
    expect(mockFetch.mock.calls[0][1].headers).toEqual({});
  });

  it('optional с токеном — с Authorization', async () => {
    await apiFetch('share', { auth: 'optional' });
    expect(mockFetch.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer tok' });
  });

  it('none — getAccessToken не вызывается', async () => {
    await apiFetch('data', { auth: 'none' });
    expect(mockGetAccessToken).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('исключение getAccessToken пробрасывается, запроса нет', async () => {
    mockGetAccessToken.mockRejectedValue(new Error('offline'));
    await expect(apiFetch('data')).rejects.toThrow('offline');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('ответ', () => {
  it('2xx — ok и разобранный json', async () => {
    const res = await apiFetch<{ data: number }>('data');
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ data: 1 });
    expect(res.error).toBeNull();
  });

  it('!ok не бросает: status, json тела, error http', async () => {
    mockFetch.mockResolvedValue(jsonResponse(409, { error: 'max_freezes' }));
    const res = await apiFetch('data', { method: 'POST', body: {} });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(409);
    expect(res.json).toEqual({ error: 'max_freezes' });
    expect(res.response?.status).toBe(409);
    expect(res.error?.code).toBe('http');
    expect(res.error?.status).toBe(409);
    expect(res.error?.body).toEqual({ error: 'max_freezes' });
    expect(res.error?.message).toBe('HTTP 409');
  });

  it('невалидный JSON — {} (и при ok, и при ошибке)', async () => {
    mockFetch.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    mockFetch.mockResolvedValueOnce(new Response('', { status: 502 }));
    const a = await apiFetch('data');
    const b = await apiFetch('data');
    expect(a.ok).toBe(true);
    expect(a.json).toEqual({});
    expect(b.ok).toBe(false);
    expect(b.status).toBe(502);
    expect(b.json).toEqual({});
  });

  it("parse 'none' — тело не читается, его читает вызывающий", async () => {
    mockFetch.mockResolvedValue(new Response('<html>', { status: 200 }));
    const res = await apiFetch('ai', { parse: 'none' });
    expect(res.json).toBeUndefined();
    await expect(res.response!.json()).rejects.toThrow();
  });
});

describe('сеть, таймаут, отмена', () => {
  it('сетевая ошибка не бросает: status 0, code network, исходная ошибка', async () => {
    const original = new TypeError('Network request failed');
    mockFetch.mockRejectedValue(original);
    const res = await apiFetch('teacher');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    expect(res.response).toBeNull();
    expect(res.error?.code).toBe('network');
    expect(res.error?.original).toBe(original);
    expect(res.error?.message).toBe('Network request failed');
  });

  it('таймаут — code timeout', async () => {
    mockFetch.mockImplementation(hangingFetch);
    const res = await apiFetch('data', { timeoutMs: 10 });
    expect(res.error?.code).toBe('timeout');
    expect(res.status).toBe(0);
  });

  it('внешний signal — code aborted', async () => {
    mockFetch.mockImplementation(hangingFetch);
    const controller = new AbortController();
    const promise = apiFetch('ai', { method: 'POST', body: {}, signal: controller.signal });
    controller.abort();
    const res = await promise;
    expect(res.error?.code).toBe('aborted');
  });

  it('timeoutMs false — голый fetch с тем же init, без signal', async () => {
    await apiFetch('push', {
      baseUrl: '/api',
      method: 'POST',
      query: { action: 'subscribe' },
      body: { token: 't' },
      timeoutMs: false,
      auth: 'optional',
    });
    expect(mockFetch).toHaveBeenCalledWith('/api/push?action=subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: '{"token":"t"}',
    });
  });
});

describe('повторы', () => {
  it('по умолчанию повторов нет', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    await apiFetch('data');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('GET повторяется при сетевой ошибке до успеха', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fail'));
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: 1 }));
    const res = await apiFetch('data', { retry: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(res.ok).toBe(true);
    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
  });

  it('GET: не больше 1 + retry попыток', async () => {
    mockFetch.mockRejectedValue(new TypeError('fail'));
    const res = await apiFetch('data', { retry: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(res.error?.code).toBe('network');
  });

  it('POST не повторяется', async () => {
    mockFetch.mockRejectedValue(new TypeError('fail'));
    await apiFetch('data', { method: 'POST', body: {}, retry: 3 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('HTTP-ошибка и таймаут не повторяются', async () => {
    mockFetch.mockResolvedValue(jsonResponse(500, {}));
    await apiFetch('data', { retry: 3 });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockReset();
    mockFetch.mockImplementation(hangingFetch);
    await apiFetch('data', { retry: 3, timeoutMs: 5 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

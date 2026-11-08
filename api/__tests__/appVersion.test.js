/**
 * Последняя версия в магазине (plan/new/app_update_prompt.md, Update 1).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getAppVersion, normVersion, parseLookup, resetAppVersionCache } from '../_appVersion.js';

const APPLE = {
  resultCount: 1,
  results: [
    {
      trackId: 6808731151,
      version: '1.8.1',
      currentVersionReleaseDate: '2026-11-02T02:00:34Z',
    },
  ],
};

const okFetch = (json = APPLE) =>
  jest.fn(async () => ({ ok: true, status: 200, json: async () => json }));
const failFetch = () =>
  jest.fn(async () => {
    throw new Error('network down');
  });

const HOUR = 60 * 60 * 1000;
const T0 = Date.parse('2026-11-08T12:00:00Z');

beforeEach(() => resetAppVersionCache());

describe('normVersion', () => {
  it('пропускает номера версий и отбрасывает мусор', () => {
    expect(normVersion('1.8.1')).toBe('1.8.1');
    expect(normVersion(' 2.0 ')).toBe('2.0');
    expect(normVersion('')).toBeNull();
    expect(normVersion('1.8.1-beta')).toBeNull();
    expect(normVersion(undefined)).toBeNull();
    expect(normVersion(181)).toBeNull();
  });
});

describe('parseLookup', () => {
  it('берёт версию и дату выхода', () => {
    expect(parseLookup(APPLE)).toEqual({
      version: '1.8.1',
      releasedAt: '2026-11-02T02:00:34.000Z',
    });
  });

  it('приложения нет в магазине этой страны — null', () => {
    expect(parseLookup({ resultCount: 0, results: [] })).toBeNull();
    expect(parseLookup(null)).toBeNull();
  });

  it('кривая дата — версия есть, даты нет', () => {
    const json = {
      results: [{ trackId: 6808731151, version: '1.8.1', currentVersionReleaseDate: 'x' }],
    };
    expect(parseLookup(json)).toEqual({ version: '1.8.1', releasedAt: null });
  });
});

describe('getAppVersion', () => {
  it('iOS: версия и дата из Apple, ссылка на магазин', async () => {
    const fetchImpl = okFetch();
    const r = await getAppVersion({ platform: 'ios', env: {}, fetchImpl, now: T0 });
    expect(r).toEqual({
      latest: '1.8.1',
      releasedAt: '2026-11-02T02:00:34.000Z',
      minVersion: null,
      storeUrl: 'https://apps.apple.com/app/id6808731151',
    });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://itunes.apple.com/lookup?id=6808731151&country=kg'
    );
  });

  it('страна магазина из APP_STORE_COUNTRY', async () => {
    const fetchImpl = okFetch();
    await getAppVersion({ platform: 'ios', env: { APP_STORE_COUNTRY: 'US' }, fetchImpl, now: T0 });
    expect(fetchImpl.mock.calls[0][0]).toContain('country=us');
  });

  it('в течение часа Apple повторно не спрашиваем', async () => {
    const fetchImpl = okFetch();
    await getAppVersion({ platform: 'ios', env: {}, fetchImpl, now: T0 });
    await getAppVersion({ platform: 'ios', env: {}, fetchImpl, now: T0 + HOUR - 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await getAppVersion({ platform: 'ios', env: {}, fetchImpl, now: T0 + HOUR });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('Apple недоступен — последний удачный ответ', async () => {
    await getAppVersion({ platform: 'ios', env: {}, fetchImpl: okFetch(), now: T0 });
    const onError = jest.fn();
    const r = await getAppVersion({
      platform: 'ios',
      env: {},
      fetchImpl: failFetch(),
      now: T0 + 2 * HOUR,
      onError,
    });
    expect(r.latest).toBe('1.8.1');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('Apple недоступен и удачного ответа не было — latest null, ссылка есть', async () => {
    const r = await getAppVersion({ platform: 'ios', env: {}, fetchImpl: failFetch(), now: T0 });
    expect(r.latest).toBeNull();
    expect(r.releasedAt).toBeNull();
    expect(r.storeUrl).toContain('6808731151');
  });

  it('после неудачи ждём 5 минут, а не спрашиваем на каждый запрос', async () => {
    const fetchImpl = failFetch();
    await getAppVersion({ platform: 'ios', env: {}, fetchImpl, now: T0 });
    await getAppVersion({ platform: 'ios', env: {}, fetchImpl, now: T0 + 60 * 1000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await getAppVersion({ platform: 'ios', env: {}, fetchImpl, now: T0 + 5 * 60 * 1000 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('пустой ответ Apple (нет в магазине страны) — как ошибка', async () => {
    const onError = jest.fn();
    const r = await getAppVersion({
      platform: 'ios',
      env: {},
      fetchImpl: okFetch({ resultCount: 0, results: [] }),
      now: T0,
      onError,
    });
    expect(r.latest).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('HTTP-ошибка Apple — как ошибка', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const r = await getAppVersion({ platform: 'ios', env: {}, fetchImpl, now: T0 });
    expect(r.latest).toBeNull();
  });

  it('APP_LATEST_VERSION_IOS перекрывает Apple, даты выхода у неё нет', async () => {
    const r = await getAppVersion({
      platform: 'ios',
      env: { APP_LATEST_VERSION_IOS: '9.9.9' },
      fetchImpl: okFetch(),
      now: T0,
    });
    expect(r.latest).toBe('9.9.9');
    expect(r.releasedAt).toBeNull();
  });

  it('APP_LATEST_VERSION_IOS совпадает с Apple — дата из Apple', async () => {
    const r = await getAppVersion({
      platform: 'ios',
      env: { APP_LATEST_VERSION_IOS: '1.8.1' },
      fetchImpl: okFetch(),
      now: T0,
    });
    expect(r.releasedAt).toBe('2026-11-02T02:00:34.000Z');
  });

  it('APP_MIN_VERSION_IOS отдаём, мусор в нём игнорируем', async () => {
    const env = { APP_MIN_VERSION_IOS: '1.5.0' };
    expect(
      (await getAppVersion({ platform: 'ios', env, fetchImpl: okFetch(), now: T0 })).minVersion
    ).toBe('1.5.0');
    resetAppVersionCache();
    const bad = { APP_MIN_VERSION_IOS: 'latest' };
    expect(
      (await getAppVersion({ platform: 'ios', env: bad, fetchImpl: okFetch(), now: T0 })).minVersion
    ).toBeNull();
  });

  it('Android и веб — пусто, Apple не спрашиваем', async () => {
    const fetchImpl = okFetch();
    for (const platform of ['android', 'web']) {
      expect(await getAppVersion({ platform, env: {}, fetchImpl, now: T0 })).toEqual({
        latest: null,
        releasedAt: null,
        minVersion: null,
        storeUrl: null,
      });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('неизвестная платформа — 400', async () => {
    await expect(
      getAppVersion({ platform: 'symbian', env: {}, fetchImpl: okFetch() })
    ).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('GET /api/data?action=app-version', () => {
  jest.mock('@neondatabase/serverless', () => ({
    neon: () => {
      throw new Error('БД трогать нельзя');
    },
  }));
  jest.mock('../_db-init.js', () => ({ ensureDatabaseInitialized: async () => {} }));
  jest.mock('../_realtime.js', () => ({ notifyCoursesChanged: async () => {} }));
  jest.mock('../_log.js', () => ({
    log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
  }));
  jest.mock('../_auth.js', () => ({
    getAuthedUser: async () => null,
    getAuthedUserId: async () => null,
    hasBearerSecret: () => false,
  }));

  function mockRes() {
    return {
      statusCode: 200,
      headers: {},
      body: undefined,
      setHeader(k, v) {
        this.headers[k] = v;
      },
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

  const data = () => require('../data.js').default;

  it('без входа и без БД отдаёт версию с кэшем на CDN', async () => {
    const realFetch = global.fetch;
    global.fetch = okFetch();
    try {
      const res = mockRes();
      await data()({ method: 'GET', query: { action: 'app-version', platform: 'ios' } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.latest).toBe('1.8.1');
      expect(res.headers['Cache-Control']).toContain('s-maxage=3600');
    } finally {
      global.fetch = realFetch;
    }
  });

  it('Apple не ответил — пустой ответ кэшируем на минуту, а не на час', async () => {
    resetAppVersionCache();
    const realFetch = global.fetch;
    global.fetch = failFetch();
    try {
      const res = mockRes();
      await data()({ method: 'GET', query: { action: 'app-version', platform: 'ios' } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.latest).toBeNull();
      expect(res.headers['Cache-Control']).toBe('public, s-maxage=60');
    } finally {
      global.fetch = realFetch;
    }
  });

  it('кривая платформа — 400, POST — 405', async () => {
    let res = mockRes();
    await data()({ method: 'GET', query: { action: 'app-version', platform: 'x' } }, res);
    expect(res.statusCode).toBe(400);
    res = mockRes();
    await data()({ method: 'POST', query: { action: 'app-version' }, body: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});

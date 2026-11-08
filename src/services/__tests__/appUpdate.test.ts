/**
 * Окно «Вышла новая версия» (plan/new/app_update_prompt.md, Update 2)
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockStore = new Map<string, unknown>();
jest.mock('../StorageService', () => ({
  StorageService: {
    getObject: (key: string) => mockStore.get(key),
    setObject: (key: string, value: unknown) => mockStore.set(key, value),
  },
}));

jest.mock('@/config/apiBase', () => ({ API_BASE: 'https://api.test' }));

import {
  CONFIG_FRESH_MS,
  ENTRY_BACKGROUND_MS,
  RELEASE_GRACE_MS,
  STORE_OPENED_QUIET_MS,
  consumeEntry,
  decideUpdatePrompt,
  isEntryPending,
  isOlder,
  loadAppUpdateState,
  markColdStart,
  markStoreOpened,
  markUpdatePromptShown,
  onAppStateChange,
  parseAppVersion,
  refreshAppVersion,
  resetEntries,
  type AppUpdateState,
  type AppVersionInfo,
  type UpdateContext,
} from '../appUpdate';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const config = (patch: Partial<AppVersionInfo> = {}): AppVersionInfo => ({
  latest: '1.9.0',
  releasedAt: new Date(NOW - 5 * DAY).toISOString(),
  minVersion: null,
  storeUrl: 'https://apps.apple.com/app/id6808731151',
  ...patch,
});

const ctx = (
  patch: Partial<UpdateContext> = {},
  state: AppUpdateState = { config: config(), fetchedAt: NOW - 60 * 1000 }
): UpdateContext => ({
  appVersion: '1.8.1',
  state,
  now: NOW,
  entryPending: true,
  inTest: false,
  inSession: false,
  launchInterrupted: false,
  ...patch,
});

beforeEach(() => {
  mockStore.clear();
  resetEntries();
});

describe('isOlder', () => {
  it('сравнивает по числам', () => {
    expect(isOlder('1.8.1', '1.9.0')).toBe(true);
    expect(isOlder('1.9.0', '1.10.0')).toBe(true);
    expect(isOlder('1.9', '1.9.0')).toBe(false);
    expect(isOlder('1.9.0', '1.9.0')).toBe(false);
    expect(isOlder('2.0.0', '1.9.9')).toBe(false);
  });

  it('кривые значения — «не старше»', () => {
    expect(isOlder('1.8.1', null)).toBe(false);
    expect(isOlder('1.8.1', 'latest')).toBe(false);
    expect(isOlder('dev', '1.9.0')).toBe(false);
  });
});

describe('decideUpdatePrompt — мягкое', () => {
  it('есть версия новее, всё спокойно — мягкое', () => {
    expect(decideUpdatePrompt(ctx())).toBe('soft');
  });

  it('уже последняя версия или новее (TestFlight) — нет', () => {
    expect(decideUpdatePrompt(ctx({ appVersion: '1.9.0' }))).toBe('none');
    expect(decideUpdatePrompt(ctx({ appVersion: '1.9.1' }))).toBe('none');
  });

  it('нет ответа сервера или latest: null — нет', () => {
    expect(decideUpdatePrompt(ctx({ state: undefined }))).toBe('none');
    expect(decideUpdatePrompt(ctx({}, { config: config({ latest: null }), fetchedAt: NOW }))).toBe(
      'none'
    );
  });

  it('за этот заход уже показали — нет', () => {
    expect(decideUpdatePrompt(ctx({ entryPending: false }))).toBe('none');
  });

  it('в тесте, в сессии, при запуске по ссылке — нет', () => {
    expect(decideUpdatePrompt(ctx({ inTest: true }))).toBe('none');
    expect(decideUpdatePrompt(ctx({ inSession: true }))).toBe('none');
    expect(decideUpdatePrompt(ctx({ launchInterrupted: true }))).toBe('none');
  });

  it('3 дня тишины после выхода версии', () => {
    const at = (ms: number) =>
      decideUpdatePrompt(
        ctx(
          {},
          {
            config: config({ releasedAt: new Date(NOW - ms).toISOString() }),
            fetchedAt: NOW,
          }
        )
      );
    expect(at(RELEASE_GRACE_MS - 1)).toBe('none');
    expect(at(RELEASE_GRACE_MS)).toBe('soft');
  });

  it('дата выхода неизвестна (ручная поправка) — не ждём', () => {
    expect(
      decideUpdatePrompt(ctx({}, { config: config({ releasedAt: null }), fetchedAt: NOW }))
    ).toBe('soft');
  });

  it('данные старше суток — нет (офлайн мягкое не показываем)', () => {
    const at = (age: number) =>
      decideUpdatePrompt(ctx({}, { config: config(), fetchedAt: NOW - age }));
    expect(at(CONFIG_FRESH_MS)).toBe('soft');
    expect(at(CONFIG_FRESH_MS + 1)).toBe('none');
    expect(decideUpdatePrompt(ctx({}, { config: config() }))).toBe('none');
  });

  it('6 часов после «Обновить» — нет', () => {
    const at = (ago: number) =>
      decideUpdatePrompt(ctx({}, { config: config(), fetchedAt: NOW, storeOpenedAt: NOW - ago }));
    expect(at(STORE_OPENED_QUIET_MS - 1)).toBe('none');
    expect(at(STORE_OPENED_QUIET_MS)).toBe('soft');
  });
});

describe('decideUpdatePrompt — обязательное', () => {
  const forced = (patch: Partial<UpdateContext> = {}, extra: Partial<AppUpdateState> = {}) =>
    decideUpdatePrompt(
      ctx(patch, { config: config({ minVersion: '1.9.0' }), fetchedAt: NOW, ...extra })
    );

  it('ниже minVersion — обязательное', () => {
    expect(forced()).toBe('force');
  });

  it('и без захода, в сессии, по ссылке, после «Обновить», со старыми данными', () => {
    expect(forced({ entryPending: false })).toBe('force');
    expect(forced({ inSession: true })).toBe('force');
    expect(forced({ launchInterrupted: true })).toBe('force');
    expect(forced({}, { storeOpenedAt: NOW - 1000 })).toBe('force');
    expect(forced({}, { fetchedAt: NOW - 30 * DAY })).toBe('force');
  });

  it('и сразу после выхода версии', () => {
    expect(
      decideUpdatePrompt(
        ctx(
          {},
          {
            config: config({ minVersion: '1.9.0', releasedAt: new Date(NOW).toISOString() }),
            fetchedAt: NOW,
          }
        )
      )
    ).toBe('force');
  });

  it('кроме идущего теста', () => {
    expect(forced({ inTest: true })).toBe('none');
  });

  it('версия равна minVersion — не обязательное', () => {
    expect(forced({ appVersion: '1.9.0' })).toBe('none');
  });
});

describe('заходы', () => {
  it('холодный запуск — заход; показали — до следующего захода нет', () => {
    expect(isEntryPending()).toBe(false);
    markColdStart();
    expect(isEntryPending()).toBe(true);
    consumeEntry();
    expect(isEntryPending()).toBe(false);
  });

  it('возврат после 30 минут в фоне — заход, после минуты — нет', () => {
    onAppStateChange('background', NOW);
    onAppStateChange('active', NOW + 60 * 1000);
    expect(isEntryPending()).toBe(false);

    onAppStateChange('background', NOW);
    onAppStateChange('active', NOW + ENTRY_BACKGROUND_MS);
    expect(isEntryPending()).toBe(true);
  });

  it('inactive (шторка уведомлений) не сбивает время ухода в фон', () => {
    onAppStateChange('background', NOW);
    onAppStateChange('inactive', NOW + 10 * 60 * 1000);
    onAppStateChange('background', NOW + 20 * 60 * 1000);
    onAppStateChange('active', NOW + ENTRY_BACKGROUND_MS);
    expect(isEntryPending()).toBe(true);
  });

  it('active без ухода в фон — не заход', () => {
    onAppStateChange('inactive', NOW);
    onAppStateChange('active', NOW + ENTRY_BACKGROUND_MS * 2);
    expect(isEntryPending()).toBe(false);
  });
});

describe('состояние на устройстве', () => {
  it('показ и «Обновить» запоминаются, ответ сервера не теряется', () => {
    mockStore.set('app_update', { config: config(), fetchedAt: NOW });
    markUpdatePromptShown(NOW + 1);
    markStoreOpened(NOW + 2);
    expect(loadAppUpdateState()).toEqual({
      config: config(),
      fetchedAt: NOW,
      lastShownAt: NOW + 1,
      storeOpenedAt: NOW + 2,
    });
  });
});

describe('parseAppVersion', () => {
  it('нормальный ответ', () => {
    expect(parseAppVersion(config())).toEqual(config());
  });

  it('битые версии — null, кривые дата и ссылка — null в поле', () => {
    expect(parseAppVersion(null)).toBeNull();
    expect(parseAppVersion({ ...config(), latest: 'новая' })).toBeNull();
    expect(parseAppVersion({ ...config(), minVersion: 2 })).toBeNull();
    expect(parseAppVersion({ ...config(), releasedAt: 'вчера' })?.releasedAt).toBeNull();
    expect(parseAppVersion({ ...config(), storeUrl: 'https://evil.test' })?.storeUrl).toBeNull();
  });
});

describe('refreshAppVersion', () => {
  const g = globalThis as { fetch?: unknown };
  const reply = (data: unknown, ok = true) =>
    jest.fn(async () => ({ ok, json: async () => ({ data }) }));

  afterEach(() => {
    g.fetch = undefined;
  });

  it('ответ сохраняется вместе со временем', async () => {
    g.fetch = reply(config());
    const s = await refreshAppVersion({ platform: 'ios', now: NOW });
    expect(s).toEqual({ config: config(), fetchedAt: NOW });
    expect(g.fetch as jest.Mock).toHaveBeenCalledWith(
      'https://api.test/data?action=app-version&platform=ios',
      expect.anything()
    );
  });

  it('без сети и при ошибке сервера — прежнее состояние', async () => {
    mockStore.set('app_update', { config: config({ minVersion: '1.9.0' }), fetchedAt: NOW });
    g.fetch = jest.fn(async () => {
      throw new Error('offline');
    });
    expect((await refreshAppVersion({ platform: 'ios', now: NOW + DAY }))?.config?.minVersion).toBe(
      '1.9.0'
    );
    g.fetch = reply({}, false);
    expect((await refreshAppVersion({ platform: 'ios', now: NOW + DAY }))?.fetchedAt).toBe(NOW);
  });

  it('latest: null — берём новый minVersion, версию и свежесть оставляем', async () => {
    mockStore.set('app_update', { config: config(), fetchedAt: NOW });
    g.fetch = reply(config({ latest: null, releasedAt: null, minVersion: '1.8.5' }));
    const s = await refreshAppVersion({ platform: 'ios', now: NOW + DAY });
    expect(s?.config?.latest).toBe('1.9.0');
    expect(s?.config?.minVersion).toBe('1.8.5');
    expect(s?.fetchedAt).toBe(NOW);
  });

  it('Android и веб — без запроса', async () => {
    g.fetch = reply(config());
    expect(await refreshAppVersion({ platform: 'android' })).toBeUndefined();
    expect(g.fetch as jest.Mock).not.toHaveBeenCalled();
  });
});

/**
 * Очередь синхронизации: отправка, повторы, офлайн, восстановление после перезапуска
 * (plan/new/code_cleanup.md, Clean 11). Состояние очереди — на уровне модуля, поэтому каждый
 * тест берёт свежий экземпляр через jest.isolateModules.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

let mockStored: unknown = null;
const mockSetObject = jest.fn((_key: string, value: unknown) => {
  mockStored = JSON.parse(JSON.stringify(value));
});
let mockPlatform = 'ios';

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatform;
    },
  },
}));
jest.mock('../StorageService', () => ({
  STORAGE_KEYS: { SYNC_QUEUE: 'sync_queue' },
  StorageService: {
    setObject: (key: string, value: unknown) => mockSetObject(key, value),
    getObject: () => mockStored,
  },
}));
jest.mock('@/utils/logger', () => ({ log: { warn: () => {}, debug: () => {}, error: () => {} } }));

type Service = typeof import('../SyncQueueService').SyncQueueService;

function freshService(): Service {
  let svc!: Service;
  jest.isolateModules(() => {
    svc = require('../SyncQueueService').SyncQueueService;
  });
  return svc;
}

/** Дать отработать промисам и таймерам повторов */
async function flush(ms = 0) {
  await jest.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  jest.useFakeTimers();
  mockStored = null;
  mockSetObject.mockClear();
  mockPlatform = 'ios';
});

afterEach(() => {
  jest.useRealTimers();
  delete (global as any).navigator;
  delete (global as any).window;
});

describe('SyncQueueService', () => {
  it('успешная задача выполняется сразу и уходит из очереди и хранилища', async () => {
    const svc = freshService();
    const exec = jest.fn(async (_p: unknown) => true);
    svc.registerExecutor('createSet', exec);
    svc.enqueue('createSet', { id: 's1' });
    await flush();
    expect(exec).toHaveBeenCalledWith({ id: 's1' });
    expect(svc.pendingCount).toBe(0);
    expect(mockStored).toEqual([]);
  });

  it('неудача — повторы через 1 с, 3 с, 10 с; потом задача остаётся и не пускает следующие', async () => {
    const svc = freshService();
    const fail = jest.fn(async (_p: unknown) => false);
    const next = jest.fn(async (_p: unknown) => true);
    svc.registerExecutor('a', fail);
    svc.registerExecutor('b', next);
    svc.enqueue('a', 1);
    svc.enqueue('b', 2);
    await flush();
    expect(fail).toHaveBeenCalledTimes(1);
    await flush(999);
    expect(fail).toHaveBeenCalledTimes(1);
    await flush(1);
    expect(fail).toHaveBeenCalledTimes(2);
    await flush(3000);
    expect(fail).toHaveBeenCalledTimes(3);
    await flush(10000);
    expect(fail).toHaveBeenCalledTimes(4); // 1 + maxRetries (3)
    await flush(60000);
    expect(fail).toHaveBeenCalledTimes(4);
    expect(next).not.toHaveBeenCalled(); // порядок сохраняется
    expect(svc.pendingCount).toBe(2);
    expect((mockStored as any[]).map((t) => t.type)).toEqual(['a', 'b']);
  });

  it('исключение исполнителя считается неудачей, следующая попытка может пройти', async () => {
    const svc = freshService();
    let calls = 0;
    svc.registerExecutor('x', async () => {
      calls++;
      if (calls === 1) throw new Error('network');
      return true;
    });
    svc.enqueue('x', null);
    await flush(1000);
    expect(calls).toBe(2);
    expect(svc.pendingCount).toBe(0);
  });

  it('после перезапуска очередь из хранилища загружается и отправляется', async () => {
    mockStored = [
      { id: '1', type: 'updateCard', payload: { c: 1 }, createdAt: 0, retries: 0, maxRetries: 3 },
    ];
    const svc = freshService();
    const exec = jest.fn(async (_p: unknown) => true);
    svc.registerExecutor('updateCard', exec);
    svc.init();
    await flush();
    expect(exec).toHaveBeenCalledWith({ c: 1 });
    expect(svc.pendingCount).toBe(0);
  });

  it('задача без исполнителя выбрасывается, а не блокирует очередь', async () => {
    const svc = freshService();
    const exec = jest.fn(async (_p: unknown) => true);
    svc.registerExecutor('known', exec);
    svc.enqueue('unknown', 1);
    svc.enqueue('known', 2);
    await flush();
    expect(exec).toHaveBeenCalledWith(2);
    expect(svc.pendingCount).toBe(0);
  });

  it('безнадёжная задача выбрасывается после retries > maxRetries × 2', async () => {
    mockStored = [
      { id: '1', type: 'bad', payload: null, createdAt: 0, retries: 6, maxRetries: 3 },
      { id: '2', type: 'good', payload: 'ok', createdAt: 0, retries: 0, maxRetries: 3 },
    ];
    const svc = freshService();
    const good = jest.fn(async (_p: unknown) => true);
    svc.registerExecutor('bad', async () => false);
    svc.registerExecutor('good', good);
    svc.init();
    await flush(20000);
    expect(good).toHaveBeenCalledWith('ok');
    expect(svc.pendingCount).toBe(0);
  });

  it('web офлайн — не отправляет; событие online — отправляет', async () => {
    mockPlatform = 'web';
    const listeners: Record<string, () => void> = {};
    (global as any).navigator = { onLine: false };
    (global as any).window = {
      addEventListener: (e: string, cb: () => void) => {
        listeners[e] = cb;
      },
      removeEventListener: () => {},
    };
    const svc = freshService();
    const exec = jest.fn(async (_p: unknown) => true);
    svc.registerExecutor('t', exec);
    svc.init();
    svc.enqueue('t', 1);
    await flush();
    expect(exec).not.toHaveBeenCalled();
    expect(svc.pendingCount).toBe(1);

    (global as any).navigator.onLine = true;
    listeners.online();
    await flush();
    expect(exec).toHaveBeenCalledWith(1);
    expect(svc.pendingCount).toBe(0);
  });
});

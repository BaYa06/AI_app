import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetSession = jest.fn<() => Promise<any>>();
const mockUnsubscribe = jest.fn();
let mockAuthListener: ((event: string, session: any) => void) | null = null;
const mockOnAuthStateChange = jest.fn((listener: (event: string, session: any) => void) => {
  mockAuthListener = listener;
  return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
});
const mockState: { client: any } = { client: null };
const mockWarn = jest.fn();

jest.mock('@/services/supabaseClient', () => ({
  get supabase() {
    return mockState.client;
  },
}));
jest.mock('@/utils/logger', () => ({
  // Лениво: фабрика выполняется раньше, чем объявлен mockWarn
  log: {
    debug: () => {},
    info: () => {},
    warn: (...a: unknown[]) => mockWarn(...a),
    error: () => {},
  },
}));

import {
  getAccessToken,
  getCurrentUser,
  getSession,
  getUserId,
  onAuthChange,
} from '../auth/session';

const session = {
  access_token: 'tok-1',
  user: { id: 'u-1', email: 'a@b.c', is_anonymous: false },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthListener = null;
  mockState.client = {
    auth: { getSession: mockGetSession, onAuthStateChange: mockOnAuthStateChange },
  };
});

describe('session: токен', () => {
  it('есть сессия — токен', async () => {
    mockGetSession.mockResolvedValue({ data: { session }, error: null });
    expect(await getAccessToken()).toBe('tok-1');
    expect(await getSession()).toBe(session);
  });

  it('нет сессии — null', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await getAccessToken()).toBeNull();
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('ошибка getSession — null и warn', async () => {
    mockGetSession.mockResolvedValue({ data: { session }, error: new Error('boom') });
    expect(await getAccessToken()).toBeNull();
    expect(mockWarn).toHaveBeenCalledWith('Session', expect.any(String), expect.any(Error));
  });

  it('исключение пробрасывается, как у прямого вызова', async () => {
    mockGetSession.mockRejectedValue(new Error('network'));
    await expect(getSession()).rejects.toThrow('network');
    await expect(getAccessToken()).rejects.toThrow('network');
    await expect(getUserId()).rejects.toThrow('network');
  });

  it('каждый вызов читает сессию заново (без кэша)', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session }, error: null });
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    expect(await getAccessToken()).toBe('tok-1');
    expect(await getAccessToken()).toBeNull();
    expect(mockGetSession).toHaveBeenCalledTimes(2);
  });
});

describe('session: пользователь', () => {
  it('getUserId', async () => {
    mockGetSession.mockResolvedValue({ data: { session }, error: null });
    expect(await getUserId()).toBe('u-1');
  });

  it('getCurrentUser — обычный и анонимный', async () => {
    mockGetSession.mockResolvedValue({ data: { session }, error: null });
    expect(await getCurrentUser()).toEqual({ id: 'u-1', email: 'a@b.c', isAnonymous: false });

    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 't', user: { id: 'u-2', is_anonymous: true } } },
      error: null,
    });
    expect(await getCurrentUser()).toEqual({ id: 'u-2', email: null, isAnonymous: true });
  });

  it('getCurrentUser: у user нет id — null', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 't', user: { email: 'a@b.c' } } },
      error: null,
    });
    expect(await getCurrentUser()).toBeNull();
  });

  it('getCurrentUser без сессии — null', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await getCurrentUser()).toBeNull();
  });
});

describe('session: onAuthChange', () => {
  it('cb вызывается асинхронно, не внутри колбэка Supabase', async () => {
    jest.useFakeTimers();
    try {
      const cb = jest.fn();
      onAuthChange(cb);
      expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);

      mockAuthListener?.('SIGNED_IN', session);
      expect(cb).not.toHaveBeenCalled();

      jest.runAllTimers();
      expect(cb).toHaveBeenCalledWith('SIGNED_IN', session);
    } finally {
      jest.useRealTimers();
    }
  });

  it('отписка снимает подписку и глушит отложенный вызов', () => {
    jest.useFakeTimers();
    try {
      const cb = jest.fn();
      const off = onAuthChange(cb);
      mockAuthListener?.('SIGNED_OUT', null);
      off();
      jest.runAllTimers();
      expect(cb).not.toHaveBeenCalled();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('session: supabase не инициализирован', () => {
  it('всё возвращает null, отписка — заглушка', async () => {
    mockState.client = undefined;
    expect(await getSession()).toBeNull();
    expect(await getAccessToken()).toBeNull();
    expect(await getUserId()).toBeNull();
    expect(await getCurrentUser()).toBeNull();
    const off = onAuthChange(() => {});
    expect(typeof off).toBe('function');
    expect(() => off()).not.toThrow();

    mockState.client = {};
    expect(await getAccessToken()).toBeNull();
    expect(() => onAuthChange(() => {})()).not.toThrow();
  });
});

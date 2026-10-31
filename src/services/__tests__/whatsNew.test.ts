import { afterEach, describe, expect, it, jest } from '@jest/globals';

const mockStore = new Map<string, unknown>();
jest.mock('../StorageService', () => ({
  StorageService: {
    getObject: (key: string) => mockStore.get(key),
    setObject: (key: string, value: unknown) => mockStore.set(key, value),
  },
}));

jest.mock('@/config/apiBase', () => ({ API_BASE: 'https://api.test' }));

import { WHATS_NEW_FALLBACK } from '@/constants/whatsNew';
import type { WhatsNewItem } from '@/types/whatsNew';
import {
  canShowNews,
  compareVersions,
  initWhatsNew,
  loadWhatsNewState,
  markShown,
  mergeNews,
  parseRemoteNews,
  refreshNews,
  currentNews,
  newsHistory,
  shouldShowProfileHint,
  unseenCount,
  wasWhatsNewShownOn,
  markSeen,
  pageItemIds,
  resolveState,
  selectNews,
  toPages,
  toSheetPages,
  type WhatsNewContext,
} from '../whatsNew';

const item = (id: string, extra: Partial<WhatsNewItem> = {}): WhatsNewItem => ({
  id,
  minVersion: '1.6.9',
  roles: ['student', 'teacher'],
  platforms: ['ios', 'android', 'web'],
  priority: 10,
  tag: 'Тег',
  title: id,
  text: 'Текст',
  art: 'swipe',
  publishedAt: '2026-10-28',
  ...extra,
});

const ctx: WhatsNewContext = {
  seen: [],
  appVersion: '1.6.9',
  role: 'student',
  platform: 'ios',
  osVersion: '26.0.1',
  today: '2026-10-31',
};

const ids = (items: WhatsNewItem[]) => items.map((n) => n.id);

describe('whatsNew', () => {
  it('версии сравниваются по числам', () => {
    expect(compareVersions('1.6.10', '1.6.9')).toBeGreaterThan(0);
    expect(compareVersions('1.6.9', '1.6.10')).toBeLessThan(0);
    expect(compareVersions('1.7', '1.7.0')).toBe(0);
    expect(compareVersions('26', '18.5')).toBeGreaterThan(0);
  });

  it('просмотренные не показываем', () => {
    expect(ids(selectNews([item('a'), item('b')], { ...ctx, seen: ['a'] }))).toEqual(['b']);
  });

  it('новость о функции из более новой сборки ждёт обновления', () => {
    const all = [item('new', { minVersion: '1.7.0' })];
    expect(selectNews(all, ctx)).toEqual([]);
    expect(ids(selectNews(all, { ...ctx, appVersion: '1.7.0' }))).toEqual(['new']);
    expect(ids(selectNews(all, { ...ctx, appVersion: '1.10.0' }))).toEqual(['new']);
  });

  it('фильтр по роли и платформе', () => {
    const all = [item('t', { roles: ['teacher'] }), item('android', { platforms: ['android'] })];
    expect(selectNews(all, ctx)).toEqual([]);
    expect(ids(selectNews(all, { ...ctx, role: 'teacher' }))).toEqual(['t']);
    expect(ids(selectNews(all, { ...ctx, platform: 'android' }))).toEqual(['android']);
  });

  it('минимальная версия ОС', () => {
    const all = [item('glass', { platforms: ['ios'], minOs: '26' })];
    expect(ids(selectNews(all, ctx))).toEqual(['glass']);
    expect(selectNews(all, { ...ctx, osVersion: '18.5' })).toEqual([]);
    expect(selectNews(all, { ...ctx, osVersion: null })).toEqual([]);
  });

  it('даты публикации и окончания', () => {
    const all = [item('later', { publishedAt: '2026-11-05' }), item('old', { expiresAt: '2026-10-30' })];
    expect(selectNews(all, ctx)).toEqual([]);
    expect(ids(selectNews(all, { ...ctx, today: '2026-11-05' }))).toEqual(['later']);
    expect(ids(selectNews([item('last', { expiresAt: '2026-10-31' })], ctx))).toEqual(['last']);
  });

  it('сортировка по priority, важное первым', () => {
    const all = [item('low', { priority: 1 }), item('high', { priority: 50 }), item('mid', { priority: 10 })];
    expect(ids(selectNews(all, ctx))).toEqual(['high', 'mid', 'low']);
  });

  it('до 4 новостей — каждая на своей странице', () => {
    const pages = toPages([item('a'), item('b'), item('c'), item('d')]);
    expect(pages.map((p) => p.kind)).toEqual(['item', 'item', 'item', 'item']);
  });

  it('больше 4 — три страницы и «И ещё» с остальными', () => {
    const pages = toPages(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => item(id)));
    expect(pages).toHaveLength(4);
    expect(pages[3]).toMatchObject({ kind: 'summary' });
    expect(pages[3].kind === 'summary' && ids(pages[3].items)).toEqual(['d', 'e', 'f']);
    expect(pageItemIds(pages)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('незнакомая иллюстрация — страница без картинки', () => {
    const [known, unknown, none] = toPages([item('a'), item('b', { art: 'rocket' }), item('c', { art: null })]);
    expect(known).toMatchObject({ art: 'swipe' });
    expect(unknown).toMatchObject({ art: null });
    expect(none).toMatchObject({ art: null });
  });

  it('первый запуск, уже в аккаунте — старый пользователь, новости покажем', () => {
    const state = resolveState(undefined, { isSignedIn: true, allIds: ['a', 'b'] });
    expect(state).toEqual({ seen: [] });
    expect(canShowNews(state)).toBe(true);
  });

  it('первый запуск без входа — новичок: до входа ничего, после входа всё просмотрено', () => {
    const fresh = resolveState(undefined, { isSignedIn: false, allIds: ['a', 'b'] });
    expect(canShowNews(fresh)).toBe(false);
    expect(resolveState(fresh, { isSignedIn: false, allIds: ['a', 'b'] })).toBe(fresh);
    const signedIn = resolveState(fresh, { isSignedIn: true, allIds: ['a', 'b'] });
    expect(signedIn).toEqual({ seen: ['a', 'b'] });
    expect(canShowNews(signedIn)).toBe(true);
  });

  it('сохранённое состояние не трогаем', () => {
    const saved = { seen: ['a'] };
    expect(resolveState(saved, { isSignedIn: true, allIds: ['a', 'b'] })).toBe(saved);
  });

  it('markSeen добавляет без повторов', () => {
    expect(markSeen(['a'], ['a', 'b'])).toEqual(['a', 'b']);
    const same = ['a'];
    expect(markSeen(same, ['a'])).toBe(same);
  });

  it('страницы для окна: новость и «И ещё»', () => {
    const pages = toPages(['a', 'b', 'c', 'd', 'e'].map((id) => item(id, { action: { label: 'Попробовать', route: 'Study' } })));
    const sheet = toSheetPages(pages);
    expect(sheet[0]).toEqual({ tag: 'Тег', title: 'a', text: 'Текст', art: 'swipe', actionLabel: 'Попробовать', items: [] });
    expect(sheet[3]).toMatchObject({ tag: 'И ещё', art: null, actionLabel: null, items: ['d', 'e'] });
  });

  it('запуск: сессия есть при первом запуске — старый пользователь', () => {
    mockStore.clear();
    initWhatsNew({ hasSession: true, signedIn: false, allIds: ['a'] });
    expect(loadWhatsNewState()).toEqual({ seen: [] });
  });

  it('запуск: без сессии — новичок, после входа и онбординга всё просмотрено', () => {
    mockStore.clear();
    initWhatsNew({ hasSession: false, signedIn: false, allIds: ['a', 'b'] });
    expect(loadWhatsNewState()).toEqual({ seen: [], markOnSignIn: true });
    // вошёл, но онбординг ещё идёт
    initWhatsNew({ hasSession: true, signedIn: false, allIds: ['a', 'b'] });
    expect(loadWhatsNewState()?.markOnSignIn).toBe(true);
    initWhatsNew({ hasSession: true, signedIn: true, allIds: ['a', 'b'] });
    expect(loadWhatsNewState()).toEqual({ seen: ['a', 'b'] });
  });

  it('показ отмечает новости и день', () => {
    mockStore.clear();
    const state = markShown({ seen: ['a'] }, ['b', 'c'], '2026-10-31');
    expect(state).toEqual({ seen: ['a', 'b', 'c'], shownDay: '2026-10-31' });
    initWhatsNew({ hasSession: true, signedIn: true, allIds: [] });
    expect(wasWhatsNewShownOn('2026-10-31')).toBe(false);
    mockStore.set('whats_new', state);
    expect(wasWhatsNewShownOn('2026-10-31')).toBe(true);
    expect(wasWhatsNewShownOn('2026-11-01')).toBe(false);
  });

  it('история: по версиям, новые сверху, с просмотренными и истёкшими', () => {
    const all = [
      item('old', { minVersion: '1.6.5', expiresAt: '2026-10-01' }),
      item('new-low', { minVersion: '1.6.10', priority: 1 }),
      item('new-high', { minVersion: '1.6.10', priority: 9 }),
      item('future', { minVersion: '1.7.0' }),
      item('teacher', { roles: ['teacher'] }),
      item('mid', { minVersion: '1.6.9' }),
    ];
    const groups = newsHistory(all, { ...ctx, appVersion: '1.6.10' });
    expect(groups.map((g) => [g.version, ids(g.items)])).toEqual([
      ['1.6.10', ['new-high', 'new-low']],
      ['1.6.9', ['mid']],
      ['1.6.5', ['old']],
    ]);
    expect(unseenCount(groups, ['old', 'mid'])).toBe(2);
  });

  it('подсказка про Профиль — один раз и только если закрыли на первой странице', () => {
    const close = { index: 0, pageCount: 3, tried: false };
    expect(shouldShowProfileHint({ seen: [] }, close)).toBe(true);
    expect(shouldShowProfileHint({ seen: [], profileHintShown: true }, close)).toBe(false);
    expect(shouldShowProfileHint({ seen: [] }, { ...close, index: 1 })).toBe(false);
    expect(shouldShowProfileHint({ seen: [] }, { ...close, tried: true })).toBe(false);
    expect(shouldShowProfileHint({ seen: [] }, { ...close, pageCount: 1 })).toBe(false);
    expect(shouldShowProfileHint(undefined, close)).toBe(false);
  });

  describe('новости с сервера', () => {
    const remoteItem = (id: string, extra: Partial<WhatsNewItem> = {}) => item(id, { minVersion: '1.6.9', ...extra });

    it('битые записи отбрасываем, ответ без items — null', () => {
      expect(parseRemoteNews(null)).toBeNull();
      expect(parseRemoteNews({ items: 'x' })).toBeNull();
      const parsed = parseRemoteNews({ items: [remoteItem('ok'), { id: 'broken' }, null], hidden: ['a', 1] });
      expect(parsed && ids(parsed.items)).toEqual(['ok']);
      expect(parsed?.hidden).toEqual([]);
    });

    it('сервер поверх сборки: замена по id, скрытие, новые', () => {
      const fallback = [item('a'), item('b'), item('c')];
      const merged = mergeNews(fallback, {
        items: [remoteItem('b', { title: 'с сервера' }), remoteItem('new')],
        hidden: ['c'],
      });
      expect(ids(merged)).toEqual(['a', 'b', 'new']);
      expect(merged.find((n) => n.id === 'b')?.title).toBe('с сервера');
      expect(mergeNews(fallback, null)).toBe(fallback);
    });

    afterEach(() => {
      (global as any).fetch = undefined;
    });

    it('загрузка: ответ сохраняется в кэш, без сети — кэш', async () => {
      mockStore.clear();
      (global as any).fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({ data: { items: [remoteItem('server-only')], hidden: ['cards-swipe'] } }),
      }));
      const fresh = await refreshNews();
      expect(ids(fresh)).toContain('server-only');
      expect(ids(fresh)).not.toContain('cards-swipe');
      expect((global as any).fetch).toHaveBeenCalledWith('https://api.test/data?action=news', expect.anything());

      (global as any).fetch = jest.fn(async () => {
        throw new Error('offline');
      });
      expect(ids(await refreshNews())).toEqual(ids(currentNews()));
      expect(ids(currentNews())).toContain('server-only');
    });

    it('сервер ответил ошибкой — сборка', async () => {
      mockStore.clear();
      (global as any).fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
      expect(ids(await refreshNews())).toEqual(ids(WHATS_NEW_FALLBACK));
    });
  });

  describe('запасная копия', () => {
    it('id не повторяются', () => {
      expect(new Set(ids(WHATS_NEW_FALLBACK)).size).toBe(WHATS_NEW_FALLBACK.length);
    });

    it('заголовок ≤ 40 символов, текст ≤ 140', () => {
      for (const n of WHATS_NEW_FALLBACK) {
        expect([n.id, n.title.length <= 40]).toEqual([n.id, true]);
        expect([n.id, n.text.length <= 140]).toEqual([n.id, true]);
      }
    });

    it('ученик на iPhone с iOS 26 видит 4 страницы, учитель — свои', () => {
      const student = toPages(selectNews(WHATS_NEW_FALLBACK, ctx));
      expect(student).toHaveLength(4);
      expect(student[0]).toMatchObject({ kind: 'item', item: { id: 'cards-swipe' } });
      const teacher = selectNews(WHATS_NEW_FALLBACK, { ...ctx, role: 'teacher', platform: 'android' });
      expect(ids(teacher)).toEqual(['share-set-teacher', 'books-2026-10-teacher', 'home-skeleton']);
    });
  });
});

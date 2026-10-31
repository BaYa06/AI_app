import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../StorageService', () => ({ StorageService: { getObject: () => undefined, setObject: () => {} } }));

import { WHATS_NEW_FALLBACK } from '@/constants/whatsNew';
import type { WhatsNewItem } from '@/types/whatsNew';
import {
  canShowNews,
  compareVersions,
  markSeen,
  pageItemIds,
  resolveState,
  selectNews,
  toPages,
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

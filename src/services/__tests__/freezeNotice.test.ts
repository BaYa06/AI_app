/**
 * «Заморозка спасла серию» (plan/new/streak_freeze_display.md, Freeze 4)
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockStore = new Map<string, boolean>();
jest.mock('../StorageService', () => ({
  StorageService: {
    getBoolean: (key: string) => mockStore.get(key),
    setBoolean: (key: string, value: boolean) => mockStore.set(key, value),
  },
}));

import { isFreezeNoticeSeen, markFreezeNoticeSeen, pickFreezeNotice } from '../freezeNotice';
import { isBlockedFor, isGateBusy, resetGate, setGateOpen } from '../modalGate';

const base = {
  todayKey: '2026-11-08',
  freezeUsed: false,
  week: [],
  streak: 5,
  freezesLeft: 1,
  isSeen: () => false,
};
const frozenYesterday = [
  {
    local_date: '2026-11-07',
    words_learned: 0,
    minutes_learned: 0,
    cards_studied: 0,
    frozen: true,
  },
];

beforeEach(() => {
  mockStore.clear();
  resetGate();
});

describe('pickFreezeNotice', () => {
  it('сервер только что потратил заморозку → сообщение за вчера', () => {
    expect(pickFreezeNotice({ ...base, freezeUsed: true })).toEqual({
      date: '2026-11-07',
      streak: 5,
      freezesLeft: 1,
    });
  });

  it('freeze_used забрал фоновый запрос → берём frozen за вчера из недели', () => {
    expect(pickFreezeNotice({ ...base, week: frozenYesterday })?.date).toBe('2026-11-07');
  });

  it('уже показано за этот день → нет', () => {
    markFreezeNoticeSeen('2026-11-07');
    expect(isFreezeNoticeSeen('2026-11-07')).toBe(true);
    expect(pickFreezeNotice({ ...base, freezeUsed: true, isSeen: isFreezeNoticeSeen })).toBeNull();
  });

  it('заморозки не было или серия 0 → нет', () => {
    expect(pickFreezeNotice(base)).toBeNull();
    expect(pickFreezeNotice({ ...base, freezeUsed: true, streak: 0 })).toBeNull();
  });

  it('frozen за позавчера — уже не «вчера», не показываем', () => {
    const old = [{ ...frozenYesterday[0], local_date: '2026-11-06' }];
    expect(pickFreezeNotice({ ...base, week: old })).toBeNull();
  });
});

describe('modalGate — место заморозки в очереди', () => {
  it('«Что нового» ждёт заморозку, заморозка — мягкое обновление', () => {
    setGateOpen('freezeNotice', true);
    expect(isBlockedFor('whatsNew')).toBe(true);
    setGateOpen('freezeNotice', false);
    setGateOpen('appUpdate', true);
    expect(isBlockedFor('freezeNotice')).toBe(true);
  });

  it('заморозка никого не вытесняет: открыто «Что нового» — она ждёт', () => {
    setGateOpen('whatsNew', true);
    expect(isBlockedFor('freezeNotice')).toBe(false);
    expect(isGateBusy('freezeNotice')).toBe(true);
    expect(isGateBusy('whatsNew')).toBe(false);
  });
});

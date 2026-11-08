import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  clearLaunchInterrupted,
  isBlockedFor,
  isLaunchInterrupted,
  markLaunchInterrupted,
  resetGate,
  setGateOpen,
  subscribeGate,
} from '../modalGate';

describe('modalGate', () => {
  beforeEach(() => resetGate());

  it('приглашение и набор по ссылке важнее «Что нового»', () => {
    expect(isBlockedFor('whatsNew')).toBe(false);
    setGateOpen('shareLink', true);
    expect(isBlockedFor('whatsNew')).toBe(true);
    expect(isBlockedFor('courseInvite')).toBe(false);
    setGateOpen('shareLink', false);
    setGateOpen('courseInvite', true);
    expect(isBlockedFor('whatsNew')).toBe(true);
    expect(isBlockedFor('shareLink')).toBe(true);
  });

  it('открытое «Что нового» никому не мешает', () => {
    setGateOpen('whatsNew', true);
    expect(isBlockedFor('courseInvite')).toBe(false);
    expect(isBlockedFor('shareLink')).toBe(false);
    expect(isBlockedFor('whatsNew')).toBe(false);
  });

  it('прерванный запуск — до ухода с главной', () => {
    expect(isLaunchInterrupted()).toBe(false);
    markLaunchInterrupted();
    expect(isLaunchInterrupted()).toBe(true);
    clearLaunchInterrupted();
    expect(isLaunchInterrupted()).toBe(false);
  });

  it('обязательное обновление важнее всех', () => {
    setGateOpen('appUpdateForce', true);
    expect(isBlockedFor('courseInvite')).toBe(true);
    expect(isBlockedFor('shareLink')).toBe(true);
    expect(isBlockedFor('appUpdate')).toBe(true);
    expect(isBlockedFor('whatsNew')).toBe(true);
    expect(isBlockedFor('appUpdateForce')).toBe(false);
  });

  it('мягкое обновление — после приглашения и набора, но раньше «Что нового»', () => {
    setGateOpen('appUpdate', true);
    expect(isBlockedFor('whatsNew')).toBe(true);
    expect(isBlockedFor('courseInvite')).toBe(false);
    expect(isBlockedFor('shareLink')).toBe(false);
    setGateOpen('appUpdate', false);
    setGateOpen('shareLink', true);
    expect(isBlockedFor('appUpdate')).toBe(true);
  });

  it('подписчики узнают только об изменениях', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeGate(listener);
    setGateOpen('shareLink', true);
    setGateOpen('shareLink', true);
    markLaunchInterrupted();
    markLaunchInterrupted();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setGateOpen('shareLink', false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

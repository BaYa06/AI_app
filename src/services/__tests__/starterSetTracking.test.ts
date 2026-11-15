/**
 * Первый ответ по стартовому набору (plan/new/new_user_activation.md, Start 1.5)
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockStore = new Map<string, unknown>();
jest.mock('../StorageService', () => ({
  StorageService: {
    getString: (key: string) => mockStore.get(key),
    setString: (key: string, value: string) => mockStore.set(key, value),
    getBoolean: (key: string) => mockStore.get(key),
    setBoolean: (key: string, value: boolean) => mockStore.set(key, value),
  },
}));
const mockFirstAnswer = jest.fn();
jest.mock('../analytics', () => ({
  Analytics: { starterSetFirstAnswer: (mode: string) => mockFirstAnswer(mode) },
}));

import { noteStarterSetAnswer, rememberStarterSet } from '../starterSetTracking';

beforeEach(() => {
  mockStore.clear();
  mockFirstAnswer.mockClear();
});

describe('noteStarterSetAnswer', () => {
  it('без выданного набора — ничего', () => {
    noteStarterSetAnswer({ setId: 'a' }, 'test');
    expect(mockFirstAnswer).not.toHaveBeenCalled();
  });

  it('ответ по другому набору — ничего', () => {
    rememberStarterSet('starter');
    noteStarterSetAnswer({ setId: 'other' }, 'test');
    expect(mockFirstAnswer).not.toHaveBeenCalled();
  });

  it('первый ответ по стартовому — одно событие, повторные молчат', () => {
    rememberStarterSet('starter');
    noteStarterSetAnswer({ setId: 'starter' }, 'flashcard');
    noteStarterSetAnswer({ setId: 'starter' }, 'test');
    expect(mockFirstAnswer).toHaveBeenCalledTimes(1);
    expect(mockFirstAnswer).toHaveBeenCalledWith('flashcard');
  });
});

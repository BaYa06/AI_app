import { describe, expect, it, jest } from '@jest/globals';

// Проверяем только чистые функции — сеть и хранилище не нужны
jest.mock('@/services/NeonService', () => ({ NeonService: {} }));
jest.mock('@/services/DatabaseService', () => ({ DatabaseService: {} }));
jest.mock('@/services/SyncQueueService', () => ({ SyncQueueService: { registerExecutor: () => {} } }));
jest.mock('@/services/supabaseClient', () => ({ supabase: {} }));
jest.mock('@/store/cardsStore', () => ({ useCardsStore: {} }));
import { isSetInCourse, isSetInMySets } from '../setsStore';
import type { CardSet } from '@/types';

const set = (patch: Partial<CardSet>) => ({ id: 's', courseId: null, ...patch }) as CardSet;
const known = new Set(['c1']);

describe('«Мои наборы» и курсы', () => {
  it('набор без курса — только в «Моих наборах»', () => {
    expect(isSetInMySets(set({}), known)).toBe(true);
    expect(isSetInCourse(set({}), 'c1')).toBe(false);
  });

  it('набор курса — только в своём курсе', () => {
    expect(isSetInMySets(set({ courseId: 'c1' }), known)).toBe(false);
    expect(isSetInCourse(set({ courseId: 'c1' }), 'c1')).toBe(true);
  });

  it('юнит книги в «Мои наборы» не попадает', () => {
    expect(isSetInMySets(set({ officialCourseIds: ['c1'] }), known)).toBe(false);
  });

  it('свой набор пропавшего курса — в «Моих наборах», read-only — нет', () => {
    expect(isSetInMySets(set({ courseId: 'gone' }), known)).toBe(true);
    expect(isSetInMySets(set({ courseId: 'gone', isReadOnly: true }), known)).toBe(false);
    expect(isSetInMySets(set({ courseId: 'gone' }))).toBe(false);
  });
});

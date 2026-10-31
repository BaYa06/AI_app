import { describe, expect, it, jest } from '@jest/globals';

// Проверяем только чистые функции — сеть и хранилище не нужны
jest.mock('@/services/NeonService', () => ({ NeonService: {} }));
jest.mock('@/services/DatabaseService', () => ({ DatabaseService: { saveSets: () => {} } }));
jest.mock('@/services/SyncQueueService', () => ({ SyncQueueService: { registerExecutor: () => {} } }));
jest.mock('@/services/supabaseClient', () => ({ supabase: {} }));
const mockDeletedCardSets: string[] = [];
jest.mock('@/store/cardsStore', () => ({
  useCardsStore: { getState: () => ({ deleteCardsBySet: (id: string) => mockDeletedCardSets.push(id) }) },
}));
import { isSetInCourse, isSetInMySets, useSetsStore } from '../setsStore';
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

describe('deleteSetsOfCourse', () => {
  it('удаляет свои наборы курса и их карточки, юнит книги остаётся в других курсах', () => {
    const sets = {
      own: set({ id: 'own', courseId: 'c1' }),
      other: set({ id: 'other', courseId: 'c2' }),
      mine: set({ id: 'mine' }),
      unitShared: set({ id: 'unitShared', courseId: 'c1', isOfficial: true, isReadOnly: true, officialCourseIds: ['c1', 'c2'] }),
      unitOnly: set({ id: 'unitOnly', courseId: 'c1', isOfficial: true, isReadOnly: true, officialCourseIds: ['c1'] }),
    };
    useSetsStore.setState({ sets, setsOrder: Object.keys(sets) });

    useSetsStore.getState().deleteSetsOfCourse('c1');

    const state = useSetsStore.getState();
    expect(state.setsOrder).toEqual(['other', 'mine', 'unitShared']);
    expect(state.sets.unitShared.officialCourseIds).toEqual(['c2']);
    expect(state.sets.unitShared.courseId).toBe('c2');
    expect(mockDeletedCardSets).toEqual(['own', 'unitOnly']);
  });
});

import { describe, expect, it } from '@jest/globals';
import type { TeacherHomeworkSummary } from '@/services/homework';
import {
  currentHomework,
  defaultHomeworkWords,
  homeworkCardSummary,
  homeworkTileCaption,
} from '../teacherHomework';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 12, 12, 0);
const hw = (id: string, dueInDays: number, over: Partial<TeacherHomeworkSummary> = {}) => ({
  id,
  title: `Ünite ${id}`,
  words: 48,
  dueAt: new Date(NOW + dueInDays * DAY).toISOString(),
  minScore: 80,
  assignAll: true,
  createdAt: '',
  assigned: 22,
  submitted: 7,
  started: 8,
  ...over,
});

describe('задание на главной и в курсе', () => {
  it('текущее — ближайшее, срок прошёл не больше 2 дней назад', () => {
    expect(currentHomework([hw('5', 5), hw('4', 3)], NOW)?.id).toBe('4');
    expect(currentHomework([hw('3', -1), hw('5', 5)], NOW)?.id).toBe('3');
    expect(currentHomework([hw('2', -3)], NOW)).toBeNull();
    expect(currentHomework([], NOW)).toBeNull();
  });

  it('сводка карточки и подпись плитки', () => {
    expect(homeworkCardSummary(hw('4', 3))).toMatchObject({
      done: 7,
      inProgress: 8,
      notStarted: 7,
    });
    expect(homeworkTileCaption(hw('4', 3))).toBe('сдали 7 из 22');
    expect(homeworkTileCaption(null)).toBe('с дедлайном');
  });

  it('слова по умолчанию — последний набор курса', () => {
    const sets = [
      { id: 'u4', title: 'Ünite 4', words: [{ id: 'a', front: 'a', back: 'a' }] },
      { id: 'u5', title: 'Ünite 5', words: [{ id: 'b', front: 'b', back: 'b' }] },
    ];
    expect(defaultHomeworkWords(sets)).toEqual({
      cardIds: ['b'],
      sets: [{ id: 'u5', title: 'Ünite 5' }],
    });
    expect(defaultHomeworkWords([])).toBeNull();
  });
});

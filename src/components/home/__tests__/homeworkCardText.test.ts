import { describe, expect, it } from '@jest/globals';
import type { StudentHomework } from '@/services/homework';
import { homeworkCardTexts, teacherInitials } from '../homeworkCardText';

const DAY = 86400000;
const NOW = new Date(2026, 10, 12, 10, 0).getTime();
const ids = (n: number, p = 'c') => Array.from({ length: n }, (_, i) => `${p}${i}`);

function hw(over: Partial<StudentHomework>): StudentHomework {
  return {
    id: 'h',
    courseId: 'c',
    courseTitle: 'A1-B',
    title: 'Ünite 4',
    teacher: 'Ильяз агай',
    cardIds: ids(48),
    setIds: ['s'],
    words: 48,
    creditedCardIds: ids(22),
    wrongCardIds: [],
    score: 93,
    minScore: 80,
    dueAt: new Date(2026, 10, 15, 20, 0).toISOString(),
    createdAt: new Date(NOW - DAY).toISOString(),
    submitted: null,
    group: { assigned: 22, submitted: 7 },
    ...over,
  };
}

describe('карточка задания ученика', () => {
  it('в процессе: прогресс, срок, «Продолжить»', () => {
    const t = homeworkCardTexts(hw({}), NOW);
    expect(t.title).toBe('Выучить Ünite 4');
    expect(t.due).toBe('до: 15.11.2026 20:00 · через 3 дня');
    expect(t.progress).toBe('22 из 48 слов · осталось 26 · ~42 мин');
    expect(t.button).toBe('Продолжить');
    expect(t.isNew).toBe(false);
  });

  it('новое задание — «Начать» и метка «Новое»', () => {
    const t = homeworkCardTexts(hw({ creditedCardIds: [], score: null }), NOW);
    expect(t.button).toBe('Начать');
    expect(t.isNew).toBe(true);
  });

  it('все слова пройдены, оценка ниже порога — «Повторить трудные»', () => {
    const t = homeworkCardTexts(hw({ creditedCardIds: ids(48), score: 70 }), NOW);
    expect(t.button).toBe('Повторить трудные');
    expect(t.progress).toContain('верно 70%, нужно 80%');
  });

  it('инициалы учителя', () => {
    expect(teacherInitials('Ильяз агай')).toBe('ИА');
  });
});

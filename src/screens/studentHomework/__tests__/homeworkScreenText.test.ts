import { describe, expect, it } from '@jest/globals';
import type { StudentHomework } from '@/services/homework';
import { homeworkScreenTexts } from '../homeworkScreenText';

const NOW = new Date(2026, 10, 12, 10, 0).getTime();
const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);

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
    wrongCardIds: ['c1', 'c2', 'c3', 'c4', 'c5'],
    score: 77,
    minScore: 80,
    dueAt: new Date(2026, 10, 15, 20, 0).toISOString(),
    createdAt: '',
    submitted: null,
    group: { assigned: 22, submitted: 7 },
    ...over,
  };
}

describe('экран задания', () => {
  it('в процессе: учить новые и сначала повторить трудные', () => {
    const t = homeworkScreenTexts(hw({}), NOW);
    expect(t.subtitle).toBe('от: Ильяз агай · A1-B');
    expect(t.allWords).toEqual({ label: 'Пройти все 48 слов', value: '22/48', done: false });
    expect(t.score).toEqual({ label: 'Верно от 80%', value: 'у тебя 77%', done: false });
    expect(t.primary).toEqual({ title: 'Учить 26 новых · ~42 мин', prefer: 'learn' });
    expect(t.secondary).toEqual({ title: 'Сначала повторить 5 трудных', prefer: 'review' });
    expect(t.group).toBe('В группе уже сдали 7 из 22');
  });

  it('все пройдены, оценка ниже порога — только повторить трудные', () => {
    const t = homeworkScreenTexts(hw({ creditedCardIds: ids(48) }), NOW);
    expect(t.allWords.done).toBe(true);
    expect(t.primary).toEqual({ title: 'Повторить 5 трудных', prefer: 'review' });
    expect(t.secondary).toBeNull();
  });

  it('просрочено и без порога', () => {
    const t = homeworkScreenTexts(
      hw({ dueAt: new Date(NOW - 3600000).toISOString(), minScore: null }),
      NOW
    );
    expect(t.overdue).toBe(true);
    expect(t.dueHint).toContain('с опозданием');
    expect(t.score).toBeNull();
  });

  it('сдано — кнопок нет', () => {
    const t = homeworkScreenTexts(
      hw({ submitted: { at: '', late: false, score: 92, diamonds: 20 } }),
      NOW
    );
    expect(t.primary).toBeNull();
  });
});

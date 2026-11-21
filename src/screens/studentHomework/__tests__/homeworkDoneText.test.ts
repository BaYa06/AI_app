import { describe, expect, it } from '@jest/globals';
import type { StudentHomework } from '@/services/homework';
import { homeworkDoneTexts } from '../homeworkDoneText';

const hw = {
  id: 'h',
  title: 'Ünite 4',
  teacher: 'Ильяз агай',
  words: 48,
  wrongCardIds: ['a', 'b', 'c'],
  dueAt: new Date(2026, 10, 15, 20, 0).toISOString(),
  group: { assigned: 22, submitted: 8 },
} as unknown as StudentHomework;

describe('задание сдано', () => {
  it('в срок: +20 алмазов, путаешь 3 слова', () => {
    const t = homeworkDoneTexts({ homeworkId: 'h', late: false, score: 91, diamonds: 20 }, hw);
    expect(t.subtitle).toBe('Ünite 4 · в срок, до 15.11.2026 20:00');
    expect(t.words).toBe('48/48');
    expect(t.diamonds).toBe('+20');
    expect(t.group).toBe('В группе сдали уже 8 из 22');
    expect(t.hard).toBe('Ещё путаешь 3 слова — они придут в повторение');
  });

  it('с опозданием — без алмазов', () => {
    const t = homeworkDoneTexts({ homeworkId: 'h', late: true, score: 85, diamonds: 0 }, hw);
    expect(t.subtitle).toBe('Ünite 4 · с опозданием');
    expect(t.diamonds).toBeNull();
  });
});

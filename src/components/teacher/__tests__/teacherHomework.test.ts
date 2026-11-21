import { describe, expect, it } from '@jest/globals';
import type { TeacherHomeworkSummary } from '@/services/homework';
import {
  cancelHomeworkMessage,
  currentHomework,
  historyRowSubtitle,
  homeworkHistory,
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

describe('история заданий (Teacher 57)', () => {
  it('идут сейчас / прошедшие / отменённые', () => {
    const canceledAt = new Date(NOW - DAY).toISOString();
    const h = homeworkHistory(
      [
        hw('5', 5),
        hw('4', 1),
        hw('1', -10),
        hw('2', -3),
        hw('6', 4, { canceledAt }),
        hw('7', -5, { canceledAt: new Date(NOW - 2 * DAY).toISOString() }),
      ],
      NOW
    );
    expect(h.current.map((x) => x.id)).toEqual(['4', '5']);
    expect(h.past.map((x) => x.id)).toEqual(['2', '1']);
    expect(h.canceled.map((x) => x.id)).toEqual(['6', '7']);
  });

  it('старый сервер без canceledAt — все живые', () => {
    expect(homeworkHistory([hw('4', 1)], NOW).canceled).toEqual([]);
  });

  it('подписи строк', () => {
    expect(historyRowSubtitle(hw('4', 1))).toMatch(
      /^до: \d\d\.\d\d\.2026 \d\d:\d\d · сдали 7 из 22$/
    );
    expect(
      historyRowSubtitle(hw('4', 1, { canceledAt: new Date(NOW).toISOString(), submitted: 30 }))
    ).toMatch(/^отменено \d\d\.11\.2026 · сдали 22 из 22$/);
  });

  it('текст отмены: со сдавшими и без', () => {
    expect(cancelHomeworkMessage(3, 22)).toContain('Уже сдали 3 из 22');
    expect(cancelHomeworkMessage(0, 22)).toContain('останется в истории');
  });
});

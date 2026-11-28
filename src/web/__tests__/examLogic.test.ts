import { describe, expect, it } from '@jest/globals';
import { defaultFormats, recommendedTime } from '@/screens/exam/examConfig';
import {
  canAddFormat,
  clampCount,
  formatsForCount,
  levelSplit,
  maxCountFor,
  minuteOptions,
  minutesFor,
  pointsPerWord,
  setFormatCount,
  setupProblem,
} from '../exam/setupLogic';
import {
  describeEditError,
  describeSkipped,
  describeSmartError,
  isEdited,
  pendingDoubtful,
} from '../exam/smartLogic';
import type { DraftItem } from '@/services/exam';

const sum = (f: Record<string, number>) => Object.values(f).reduce((a, b) => a + b, 0);

describe('число слов', () => {
  it('границы: от 4 до 50 и не больше, чем есть в наборах', () => {
    expect(maxCountFor(0)).toBe(50);
    expect(maxCountFor(30)).toBe(30);
    expect(maxCountFor(2)).toBe(4);
    expect(maxCountFor(500)).toBe(50);
    expect(clampCount(100, 30)).toBe(30);
    expect(clampCount(1, 30)).toBe(4);
    expect(clampCount(NaN, 30)).toBe(4);
  });
  it('доли форматов по умолчанию всегда дают ровно count', () => {
    for (let n = 4; n <= 50; n++) expect(sum(formatsForCount(n))).toBe(n);
  });
});

describe('setFormatCount', () => {
  const start = defaultFormats(20);
  it('«выбор» — остаток, руками не меняется', () => {
    expect(setFormatCount(start, 20, 'choice', 1)).toBe(start);
  });
  it('добавление письма забирает у выбора, сумма сохраняется', () => {
    const next = setFormatCount(start, 20, 'write', start.write + 1);
    expect(next.write).toBe(start.write + 1);
    expect(next.choice).toBe(start.choice - 1);
    expect(sum(next)).toBe(20);
  });
  it('пары: 1–2 → скачок до 3, вниз — до нуля', () => {
    const noPairs = { choice: 16, write: 4, scramble: 0, match: 0, gap: 0 };
    expect(setFormatCount(noPairs, 20, 'match', 1).match).toBe(3);
    const three = setFormatCount(noPairs, 20, 'match', 3);
    expect(setFormatCount(three, 20, 'match', 2).match).toBe(0);
  });
  it('нельзя набрать больше слов, чем есть', () => {
    const tight = { choice: 0, write: 20, scramble: 0, match: 0, gap: 0 };
    expect(setFormatCount(tight, 20, 'scramble', 1)).toBe(tight);
    expect(canAddFormat(tight, 'scramble')).toBe(false);
  });
  it('canAddFormat: пары не добавить, если «выбора» меньше трёх', () => {
    expect(canAddFormat({ choice: 2, write: 18, scramble: 0, match: 0, gap: 0 }, 'match')).toBe(
      false
    );
    expect(canAddFormat({ choice: 5, write: 15, scramble: 0, match: 0, gap: 0 }, 'match')).toBe(
      true
    );
    expect(canAddFormat(start, 'choice')).toBe(false);
  });
});

describe('время и баллы', () => {
  it('20 слов по умолчанию — «Советуем» 7 минут (как в телефоне)', () => {
    expect(recommendedTime(defaultFormats(20)).minutes).toBe(7);
  });
  it('варианты минут и свой срок', () => {
    expect(minuteOptions(7)).toEqual({ less: 5, rec: 7, more: 10 });
    expect(minuteOptions(2).less).toBe(1);
    expect(minutesFor('rec', null, 7)).toBe(7);
    expect(minutesFor('custom', 12, 7)).toBe(12);
    expect(minutesFor('custom', null, 7)).toBe(7);
    expect(minutesFor('custom', 999, 7)).toBe(180);
  });
  it('баллы за слово и деление на сложность', () => {
    expect(pointsPerWord(20)).toBe(5);
    expect(pointsPerWord(30)).toBe(3.33);
    expect(levelSplit(20)).toEqual({ easy: 7, mid: 7, hard: 6 });
    expect(levelSplit(4)).toEqual({ easy: 2, mid: 2, hard: 0 });
  });
});

describe('setupProblem', () => {
  it('ничего не выбрано — подсказка', () => {
    expect(setupProblem({ selected: [], count: 20, formats: defaultFormats(20) })).toMatch(/набор/);
  });
  it('форматы не сходятся с числом слов', () => {
    expect(
      setupProblem({
        selected: ['a'],
        count: 20,
        formats: { choice: 1, write: 0, scramble: 0, match: 0, gap: 0 },
      })
    ).toMatch(/Форматы/);
  });
  it('всё хорошо — null', () => {
    expect(setupProblem({ selected: ['a'], count: 20, formats: defaultFormats(20) })).toBeNull();
  });
});

const item = (extra: Record<string, unknown>): DraftItem => ({
  itemId: 'i',
  cardId: 'c',
  blockNo: 1,
  format: 'gap',
  direction: 'gap',
  prompt: 'p _____',
  answer: 'a',
  options: ['a', 'b', 'c', 'd'],
  difficulty: 'mid',
  points: 5,
  extra,
});

describe('сомнительные вопросы', () => {
  it('на подтверждение попадают только принятые предложения ИИ с сомнением', () => {
    const items = [
      item({}),
      item({ edit: { edited: true, source: 'teacher' } }),
      item({ edit: { edited: true, source: 'ai', doubtful: false } }),
      item({ edit: { edited: true, source: 'ai', doubtful: true } }),
    ];
    expect(pendingDoubtful(items)).toHaveLength(1);
    expect(isEdited(items[0])).toBe(false);
    expect(isEdited(items[1])).toBe(true);
  });
  it('мусор в extra не ломает', () => {
    expect(pendingDoubtful([item({ edit: 'x' }), item({ edit: null })])).toEqual([]);
  });
});

describe('тексты ошибок', () => {
  it('лимит ИИ, чужой и начатый экзамен', () => {
    expect(describeSmartError(429, 'hourly_limit')).toMatch(/лимит/);
    expect(describeSmartError(409)).toMatch(/начался/);
    expect(describeSmartError(403)).toMatch(/не твой/);
    expect(describeSmartError(0)).toMatch(/связи/);
    expect(describeSmartError(502)).toMatch(/ИИ/);
  });
  it('причины пропуска и коды правки понятны', () => {
    expect(describeSkipped('long_answer')).toMatch(/длинный/);
    expect(describeSkipped('sentence_no_gap')).toMatch(/Предложение/);
    expect(describeSkipped('distractors_duplicate')).toMatch(/Варианты/);
    expect(describeSkipped('что-то новое')).toMatch(/не справился/);
    expect(describeEditError('same_as_answer', 1)).toMatch(/вариант 2/);
    expect(describeEditError('answer_in_sentence')).toMatch(/подсказка/);
    expect(describeEditError(undefined)).toMatch(/Не получилось/);
  });
});

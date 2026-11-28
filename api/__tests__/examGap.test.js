/**
 * «Вставь слово» пишет ИИ (решение пользователя 28.11.2026): сборка ставит заготовки, проверка кодом
 * ответа модели (judgeGap). Сеть и база не нужны.
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@neondatabase/serverless', () => ({ neon: () => () => Promise.resolve([]) }));
jest.mock('../_auth.js', () => ({ getAuthedUserId: async () => null }));
jest.mock('../_log.js', () => ({
  log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));
jest.mock('../_ai/gemini.js', () => ({
  MODELS: { text: [] },
  generateJson: async () => '[]',
  parseJsonArray: () => [],
  sendAiError: () => {},
}));

import { buildPrompt, judgeGap, sameStem } from '../_ai/exam-gap.js';
import { buildExam } from '../_exam/build.js';

const item = { baseForm: 'study' };
const good = {
  sentence: 'Last night she studied for three hours before the big test.',
  form: 'studied',
  wrong: ['painted', 'cooked', 'cleaned'],
  onlyAnswerFits: true,
};

describe('sameStem — в предложении то же слово, а не другое', () => {
  it('окончания допустимы', () => {
    expect(sameStem('studied', 'study')).toBe(true);
    expect(sameStem('boxes', 'box')).toBe(true);
    expect(sameStem('Running', 'run')).toBe(true);
    expect(sameStem('reluctant', 'reluctant')).toBe(true);
  });
  it('другое слово — нет', () => {
    expect(sameStem('learned', 'study')).toBe(false);
    expect(sameStem('went', 'go')).toBe(false);
    expect(sameStem('', 'go')).toBe(false);
  });
  it('фразы — только как есть', () => {
    expect(sameStem('give up', 'give up')).toBe(true);
    expect(sameStem('gave up', 'give up')).toBe(false);
  });
});

describe('judgeGap', () => {
  it('хороший ответ: пропуск на месте формы, ответ — форма, три варианта', () => {
    expect(judgeGap(item, good, ['study', 'apple'])).toEqual({
      ok: true,
      prompt: 'Last night she _____ for three hours before the big test.',
      answer: 'studied',
      options: ['studied', 'painted', 'cooked', 'cleaned'],
    });
  });
  it('другое слово вместо нужного — отказ', () => {
    expect(
      judgeGap(item, {
        ...good,
        sentence: 'She learned a lot last night at the library.',
        form: 'learned',
      }).reason
    ).toBe('other_word');
  });
  it('формы нет в предложении или она дважды — отказ', () => {
    expect(
      judgeGap(item, { ...good, sentence: 'She was tired after the long day at school.' }).reason
    ).toBe('no_word_in_sentence');
    expect(
      judgeGap(item, { ...good, sentence: 'She studied and studied for the test all night.' })
        .reason
    ).toBe('no_word_in_sentence');
  });
  it('другое слово экзамена в предложении — подсказка, отказ', () => {
    expect(
      judgeGap(
        item,
        { ...good, sentence: 'Last night she studied an apple recipe for her mother.' },
        ['study', 'apple']
      ).reason
    ).toBe('leaks_other_word');
  });
  it('модель сама сомневается — отказ', () => {
    expect(judgeGap(item, { ...good, onlyAnswerFits: false }).reason).toBe('model_doubt');
  });
  it('плохие варианты отбрасываются: синоним-форма ответа, однокоренной, другой алфавит, повтор, слово из предложения', () => {
    const r = judgeGap(item, {
      ...good,
      wrong: ['studied', 'studying', 'читал', 'painted', 'Painted', 'hours', 'cooked', 'cleaned'],
    });
    expect(r).toMatchObject({ ok: true, options: ['studied', 'painted', 'cooked', 'cleaned'] });
  });
  it('меньше трёх нормальных вариантов — отказ', () => {
    expect(judgeGap(item, { ...good, wrong: ['painted', 'studied'] }).reason).toBe('few_options');
  });
  it('мусор — отказ', () => {
    expect(judgeGap(item, null).reason).toBe('bad_answer');
    expect(judgeGap(item, 'x').reason).toBe('bad_answer');
  });
});

describe('промпт', () => {
  it('просит форму под предложение, варианты не синонимы и не использует другие слова экзамена', () => {
    const p = buildPrompt([{ baseForm: 'study', meaning: 'учиться' }], 'English', [
      'study',
      'apple',
    ]);
    expect(p).toMatch(/1\. word: "study" — meaning: "учиться"/);
    expect(p).toMatch(/NEVER a synonym/);
    expect(p).toMatch(/apple/);
    expect(p).toMatch(/EXACTLY 1 objects/);
  });
});

describe('сборка: «вставь слово» с ИИ — заготовки без примеров', () => {
  const cards = Array.from({ length: 12 }, (_, i) => ({
    id: `c${i}`,
    setId: 's',
    front: [
      'study',
      'apple',
      'river',
      'happy',
      'quickly',
      'teacher',
      'window',
      'borrow',
      'answer',
      'travel',
      'garden',
      'listen',
    ][i],
    back: `перевод ${i}`,
    example: null,
  }));
  const base = {
    cards,
    backKind: 'translation',
    levels: new Map(cards.map((c) => [c.id, 'mid'])),
    config: {
      count: 12,
      mode: 'random',
      formats: { choice: 8, write: 0, scramble: 0, match: 0, gap: 4 },
    },
    seed: 'test',
  };
  it('без ИИ слова без примеров в «вставь слово» не идут', () => {
    const exam = buildExam(base);
    expect(exam.items.filter((i) => i.format === 'gap')).toHaveLength(0);
  });
  it('с ИИ — заготовки: пустое предложение, ответ = слово, пометка pending', () => {
    const exam = buildExam({ ...base, aiGap: true });
    const gaps = exam.items.filter((i) => i.format === 'gap');
    expect(gaps).toHaveLength(4);
    for (const g of gaps) {
      expect(g.prompt).toBe('');
      expect(g.options).toBeNull();
      expect(g.extra.ai).toBe('pending');
      expect(g.extra.baseForm).toBe(g.answer);
    }
  });
});

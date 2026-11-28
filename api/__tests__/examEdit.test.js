/**
 * Правка вопросов черновика и «умные варианты» (plan/new/web_cabinet.md, Web 15–16).
 * Чистые проверки edit.js и разбор ответа ИИ (judge/pickItems); сеть и база не нужны.
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

import {
  blankSentence,
  countWord,
  isEditable,
  suspicion,
  validateDistractors,
  validateSentence,
} from '../_exam/edit.js';
import { judge, pickItems } from '../_ai/exam-smart.js';

const choice = {
  id: 'c1',
  format: 'choice',
  prompt: 'reluctant',
  answer: 'неохотный',
  options: ['неохотный', 'щедрый', 'быстрый', 'тихий'],
  extra: {},
};
const gap = {
  id: 'g1',
  format: 'gap',
  prompt: 'She was _____ to leave the party early.',
  answer: 'reluctant',
  options: ['reluctant', 'eager', 'happy', 'ready'],
  extra: { baseForm: 'reluctant' },
};

describe('isEditable', () => {
  it('правим только выбор и «вставь слово»', () => {
    expect(isEditable(choice)).toBe(true);
    expect(isEditable(gap)).toBe(true);
    expect(isEditable({ format: 'write' })).toBe(false);
    expect(isEditable({ format: 'match' })).toBe(false);
    expect(isEditable(null)).toBe(false);
  });
});

describe('validateDistractors', () => {
  it('ставит правильный ответ первым и сохраняет число вариантов', () => {
    const r = validateDistractors(choice, [' добрый ', 'шумный', 'новый']);
    expect(r).toEqual({ ok: true, options: ['неохотный', 'добрый', 'шумный', 'новый'] });
  });
  it('число вариантов менять нельзя', () => {
    expect(validateDistractors(choice, ['а', 'б']).error).toBe('wrong_count');
    expect(validateDistractors(choice, ['а', 'б', 'в', 'г']).error).toBe('wrong_count');
    expect(validateDistractors(choice, 'x').error).toBe('wrong_count');
  });
  it('пустой, длинный, равный ответу и повтор — ошибки с номером', () => {
    expect(validateDistractors(choice, ['', 'б', 'в'])).toMatchObject({ error: 'empty', index: 0 });
    expect(validateDistractors(choice, ['а', 'x'.repeat(81), 'в'])).toMatchObject({
      error: 'too_long',
      index: 1,
    });
    expect(validateDistractors(choice, ['а', 'б', ' Неохотный.'])).toMatchObject({
      error: 'same_as_answer',
      index: 2,
    });
    expect(validateDistractors(choice, ['а', 'Б', 'б'])).toMatchObject({
      error: 'duplicate',
      index: 2,
    });
  });
  it('перевод через запятую: вариант, совпадающий с частью ответа, — тот же ответ', () => {
    const item = {
      ...choice,
      answer: 'машина, автомобиль',
      options: ['машина, автомобиль', 'а', 'б', 'в'],
    };
    expect(validateDistractors(item, ['автомобиль', 'б', 'в']).error).toBe('same_as_answer');
  });
});

describe('validateSentence', () => {
  it('одно предложение с одним пропуском', () => {
    expect(validateSentence(gap, ' She was _____  to   leave. Really. ').ok).toBe(true);
  });
  it('нет пропуска, два пропуска, короткое, длинное', () => {
    expect(validateSentence(gap, 'She was happy to leave early.').error).toBe('no_gap');
    expect(validateSentence(gap, 'She was _____ to _____ leave early.').error).toBe('many_gaps');
    expect(validateSentence(gap, 'So _____ .').error).toBe('too_short');
    expect(validateSentence(gap, '_____ ' + 'слово '.repeat(60)).error).toBe('too_long');
    expect(validateSentence(gap, '').error).toBe('empty');
  });
  it('ответ вне пропуска — подсказка, нельзя', () => {
    expect(validateSentence(gap, 'Reluctant people feel _____ to speak up.').error).toBe(
      'answer_in_sentence'
    );
  });
  it('слово, лишь содержащее ответ внутри другого слова, подсказкой не считается', () => {
    expect(
      validateSentence({ ...gap, answer: 'act' }, 'The _____ of kindness is a fact today.').ok
    ).toBe(true);
  });
});

describe('blankSentence и countWord', () => {
  it('ставит пропуск на слово, регистр не важен', () => {
    expect(blankSentence('Reluctant at first, he agreed.', 'reluctant')).toBe(
      '_____ at first, he agreed.'
    );
  });
  it('слова нет или оно дважды — null', () => {
    expect(blankSentence('He was unwilling.', 'reluctant')).toBeNull();
    expect(blankSentence('A reluctant man, reluctant to go.', 'reluctant')).toBeNull();
  });
  it('целые слова: act не находится в fact', () => {
    expect(countWord('a fact', 'act')).toBe(0);
    expect(countWord('an act of kindness', 'act')).toBe(1);
  });
  it('спецсимволы в слове не ломают поиск', () => {
    expect(countWord('use (it) now', '(it)')).toBe(1);
  });
});

describe('suspicion', () => {
  it('однокоренной вариант — сомнение', () => {
    const r = suspicion(gap, { distractors: ['reluctantly', 'eager', 'ready'] });
    expect(r.map((x) => x.code)).toEqual(['family']);
  });
  it('пометка модели попадает в список', () => {
    const r = suspicion(choice, { distractors: ['а'], modelFlags: ['что-то'] });
    expect(r).toEqual([{ code: 'model', text: 'что-то' }]);
  });
  it('чисто — пусто', () => {
    expect(suspicion(gap, { distractors: ['eager', 'happy', 'ready'] })).toEqual([]);
  });
});

describe('pickItems', () => {
  it('берёт нужные форматы, пропускает без вариантов и с длинным ответом', () => {
    const items = [
      choice,
      gap,
      { id: 'w', format: 'write', options: null, answer: 'x', extra: {} },
      { ...choice, id: 'c2', answer: 'x'.repeat(50) },
      { ...gap, id: 'g2', options: null },
    ];
    const r = pickItems(items, ['gap', 'choice']);
    expect(r.chosen.map((i) => i.id)).toEqual(['c1', 'g1']);
    expect(r.skipped).toEqual([
      { itemId: 'c2', reason: 'long_answer' },
      { itemId: 'g2', reason: 'no_options' },
    ]);
  });
  it('kinds ограничивает форматы', () => {
    expect(pickItems([choice, gap], ['gap']).chosen.map((i) => i.id)).toEqual(['g1']);
  });
});

describe('judge — разбор ответа ИИ', () => {
  it('хороший ответ для «вставь слово»', () => {
    const r = judge(gap, {
      n: 1,
      sentence: 'The boy was reluctant to speak in front of the class.',
      wrong: ['careful', 'curious', 'jealous'],
      alsoFits: '',
    });
    expect(r.suggestion).toMatchObject({
      itemId: 'g1',
      kind: 'gap',
      doubtful: false,
      after: {
        prompt: 'The boy was _____ to speak in front of the class.',
        options: ['careful', 'curious', 'jealous'],
      },
      before: { prompt: gap.prompt, options: ['eager', 'happy', 'ready'] },
    });
  });
  it('ИИ сам отметил второй верный ответ — сомнительно, но не скрыто', () => {
    const r = judge(choice, { wrong: ['добрый', 'шумный', 'новый'], alsoFits: 'добрый' });
    expect(r.suggestion.doubtful).toBe(true);
    expect(r.suggestion.reasons[0].code).toBe('model');
  });
  it('вариант другой письменности — отброшен', () => {
    expect(
      judge(gap, { sentence: 'The boy was reluctant to go home.', wrong: ['быстрый', 'b', 'c'] })
    ).toEqual({
      skip: 'wrong_language',
    });
  });
  it('в предложении нет слова — отброшено', () => {
    expect(
      judge(gap, { sentence: 'The boy was unwilling to go home now.', wrong: ['a', 'b', 'c'] }).skip
    ).toBe('no_word_in_sentence');
  });
  it('мало вариантов, повторы, равный ответу — отброшено', () => {
    expect(judge(choice, { wrong: ['а', 'б'] }).skip).toBe('distractors_wrong_count');
    expect(judge(choice, { wrong: ['а', 'а', 'б'] }).skip).toBe('distractors_duplicate');
    expect(judge(choice, { wrong: ['неохотный', 'б', 'в'] }).skip).toBe(
      'distractors_same_as_answer'
    );
  });
  it('мусор вместо объекта — отброшено', () => {
    expect(judge(choice, null).skip).toBe('bad_answer');
    expect(judge(choice, 'text').skip).toBe('bad_answer');
  });
});

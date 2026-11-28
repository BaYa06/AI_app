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

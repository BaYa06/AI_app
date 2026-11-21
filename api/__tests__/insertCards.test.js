/**
 * Карточки сохраняются с формой слова в примере (wordForm): без неё «Слово в контексте»
 * после синхронизации не находит пропуск для «먹다 → 먹어요».
 */
import { describe, expect, it } from '@jest/globals';
import { insertCards } from '../_handlers/data/sets.js';

const ME = '11111111-1111-4111-8111-111111111111';
const SET = '33333333-3333-4333-8333-333333333333';
const CARD = '44444444-4444-4444-8444-444444444444';

describe('insertCards', () => {
  it('word_form уходит в INSERT', async () => {
    const calls = [];
    const sql = (strings, ...values) => {
      const text = strings.join('?');
      calls.push({ text, values });
      if (/SELECT id FROM card_sets/.test(text)) return Promise.resolve([{ id: SET }]);
      return Promise.resolve([]);
    };
    await insertCards(sql, ME, [
      { id: CARD, setId: SET, frontText: '먹다', backText: 'Есть', wordForm: '먹어요' },
    ]);
    const insert = calls.find((c) => /INSERT INTO cards/.test(c.text));
    expect(insert.text).toMatch(/word_form/);
    const json = insert.values.find((v) => typeof v === 'string' && v.startsWith('['));
    expect(JSON.parse(json)[0].word_form).toBe('먹어요');
  });
});

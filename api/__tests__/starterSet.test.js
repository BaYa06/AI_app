/**
 * Стартовый набор (plan/new/new_user_activation.md, Start 1.3): один раз в жизни аккаунта,
 * учитель не получает, всё в одной транзакции.
 */
import { describe, expect, it } from '@jest/globals';
import { createStarterSet } from '../_handlers/data/starter.js';

const ME = '11111111-1111-4111-8111-111111111111';
const SET = '33333333-3333-4333-8333-333333333333';
const CARD = '44444444-4444-4444-8444-444444444444';

/** Поддельный sql: SELECT пользователя отвечает `user`, после транзакции — `afterId` */
function fakeSql({ user, afterId }) {
  const calls = [];
  let txn = null;
  let selects = 0;
  const sql = (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (/SELECT starter_set_id/.test(text)) {
      selects += 1;
      if (selects === 1) return Promise.resolve(user ? [user] : []);
      return Promise.resolve([{ starter_set_id: afterId }]);
    }
    return { text, values };
  };
  sql.transaction = (queries) => {
    txn = queries;
    return Promise.resolve(queries.map(() => []));
  };
  return { sql, calls, getTxn: () => txn };
}

const payload = {
  set: { id: SET, title: 'Первые слова', languageFrom: 'en', languageTo: 'ru', kind: 'language' },
  cards: [{ id: CARD, setId: 'чужой', frontText: 'Hello', backText: 'Привет', example: 'Hello!' }],
};

describe('createStarterSet', () => {
  it('первый раз: флаг, набор и карточки — одной транзакцией', async () => {
    const f = fakeSql({ user: { starter_set_id: null, teacher: false }, afterId: SET });
    const res = await createStarterSet(f.sql, ME, payload);
    expect(res).toEqual({ created: true, setId: SET });
    const txn = f.getTxn();
    expect(txn).toHaveLength(3);
    expect(txn[0].text).toMatch(/UPDATE users SET starter_set_id/);
    expect(txn[0].text).toMatch(/starter_set_id IS NULL/);
    expect(txn[1].text).toMatch(/INSERT INTO card_sets/);
    expect(txn[1].text).toMatch(/WHERE EXISTS/);
    expect(txn[2].text).toMatch(/INSERT INTO cards/);
    expect(txn[2].text).toMatch(/WHERE EXISTS/);
  });

  it('карточки идут в этот набор, а не в тот, что прислал клиент', async () => {
    const f = fakeSql({ user: { starter_set_id: null, teacher: false }, afterId: SET });
    await createStarterSet(f.sql, ME, payload);
    const cardsQuery = f.getTxn()[2];
    expect(cardsQuery.values).toContain(SET);
    const json = cardsQuery.values.find((v) => typeof v === 'string' && v.startsWith('['));
    expect(JSON.parse(json)[0]).not.toHaveProperty('set_id');
  });

  it('уже выдавали — второй набор не создаётся', async () => {
    const f = fakeSql({ user: { starter_set_id: SET, teacher: false }, afterId: SET });
    const res = await createStarterSet(f.sql, ME, payload);
    expect(res).toEqual({ created: false, reason: 'already_issued' });
    expect(f.getTxn()).toBeNull();
  });

  it('учитель стартовый набор не получает', async () => {
    const f = fakeSql({ user: { starter_set_id: null, teacher: true }, afterId: null });
    const res = await createStarterSet(f.sql, ME, payload);
    expect(res).toEqual({ created: false, reason: 'teacher' });
    expect(f.getTxn()).toBeNull();
  });

  it('параллельный запрос успел первым — отвечаем «уже выдан»', async () => {
    const other = '55555555-5555-4555-8555-555555555555';
    const f = fakeSql({ user: { starter_set_id: null, teacher: false }, afterId: other });
    const res = await createStarterSet(f.sql, ME, payload);
    expect(res).toEqual({ created: false, reason: 'already_issued' });
  });

  it('без карточек или слишком много — 400', async () => {
    const f = fakeSql({ user: { starter_set_id: null, teacher: false }, afterId: SET });
    await expect(createStarterSet(f.sql, ME, { ...payload, cards: [] })).rejects.toThrow();
    const many = Array.from({ length: 41 }, () => payload.cards[0]);
    await expect(createStarterSet(f.sql, ME, { ...payload, cards: many })).rejects.toThrow();
  });
});

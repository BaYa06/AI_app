/**
 * Откуда набор (plan/new/teacher_cabinet.md, Teacher 31): createSet пишет только известный origin,
 * старый клиент (без поля) — NULL.
 */
import { describe, expect, it } from '@jest/globals';
import { optSetOrigin, createSet } from '../_handlers/data/sets.js';

const ME = '11111111-1111-4111-8111-111111111111';
const SET = '33333333-3333-4333-8333-333333333333';

describe('optSetOrigin', () => {
  it('известные значения проходят, остальное — null', () => {
    for (const o of ['manual', 'ai', 'file', 'library', 'share']) expect(optSetOrigin(o)).toBe(o);
    expect(optSetOrigin(undefined)).toBeNull();
    expect(optSetOrigin('hack')).toBeNull();
  });
});

describe('createSet', () => {
  function run(p) {
    const calls = [];
    const sql = (strings, ...values) => {
      calls.push({ text: strings.join('?'), values });
      return Promise.resolve([]);
    };
    return createSet(sql, ME, p).then(() => calls[0]);
  }

  it('origin уходит в INSERT последним значением', async () => {
    const q = await run({ id: SET, title: 'A', origin: 'ai' });
    expect(q.text).toMatch(/studying_cards, origin/);
    expect(q.values[q.values.length - 1]).toBe('ai');
  });

  it('старый клиент без origin — NULL', async () => {
    const q = await run({ id: SET, title: 'A' });
    expect(q.values[q.values.length - 1]).toBeNull();
  });
});

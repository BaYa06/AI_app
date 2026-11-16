/**
 * Задания «Начало пути» и алмазы (plan/new/new_user_activation.md, Start 3.1, 3.9)
 */
import { describe, expect, it } from '@jest/globals';
import { completeOnboardingTask, getOnboardingTasks } from '../_handlers/data/onboardingTasks.js';

const ME = '11111111-1111-4111-8111-111111111111';

function fakeSql(responses) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });
    const r = responses.find((x) => x.match.test(text));
    return Promise.resolve(r ? r.rows : []);
  };
  return { sql, calls };
}

describe('completeOnboardingTask', () => {
  it('первый раз: строка задания и +10 алмазов одним запросом', async () => {
    const f = fakeSql([{ match: /WITH ins AS/, rows: [{ diamond: 30 }] }]);
    const res = await completeOnboardingTask(f.sql, ME, { task: 'library' });
    expect(res).toEqual({ awarded: 10, diamonds: 30 });
    expect(f.calls[0].text).toMatch(/ON CONFLICT \(user_id, task\) DO NOTHING/);
    expect(f.calls[0].text).toMatch(/EXISTS \(SELECT 1 FROM ins\)/);
    expect(f.calls[0].text).toMatch(/starter_set_id IS NOT NULL/);
  });

  it('повтор: награды нет, баланс как есть', async () => {
    const f = fakeSql([
      { match: /WITH ins AS/, rows: [] },
      { match: /SELECT COALESCE\(diamond/, rows: [{ diamond: 30 }] },
    ]);
    const res = await completeOnboardingTask(f.sql, ME, { task: 'library' });
    expect(res).toEqual({ awarded: 0, diamonds: 30 });
  });

  it('неизвестное задание — 400', async () => {
    const f = fakeSql([]);
    await expect(completeOnboardingTask(f.sql, ME, { task: 'hack' })).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });
});

describe('getOnboardingTasks', () => {
  it('выполненные задания, стартовый набор и баланс', async () => {
    const issued = '2026-11-15T10:00:00.000Z';
    const f = fakeSql([
      {
        match: /SELECT starter_set_id/,
        rows: [
          {
            starter_set_id: 'set-1',
            starter_set_issued_at: issued,
            diamond: 20,
            target_languages: ['en', 'de'],
            starter_extra: {},
          },
        ],
      },
      { match: /SELECT task FROM onboarding_tasks/, rows: [{ task: 'first_lesson' }] },
    ]);
    const res = await getOnboardingTasks(f.sql, ME);
    expect(res).toEqual({
      starterSetId: 'set-1',
      startedAt: Date.parse(issued),
      done: ['first_lesson'],
      diamonds: 20,
      reward: 10,
      targetLanguages: ['en', 'de'],
      extraStarterLanguages: [],
    });
  });
});

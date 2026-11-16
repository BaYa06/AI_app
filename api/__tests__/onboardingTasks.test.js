/**
 * Задания «Начало пути» и алмазы (plan/new/new_user_activation.md, Start 3.1, 3.9)
 */
import { describe, expect, it } from '@jest/globals';
import {
  completeOnboardingTask,
  getOnboardingTasks,
  startCourseStudentTasks,
} from '../_handlers/data/onboardingTasks.js';

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
    expect(f.calls[0].text).toMatch(/starter_set_id IS NOT NULL OR start_tasks_at IS NOT NULL/);
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
            start_tasks_at: null,
            diamond: 20,
            native_language: 'ru',
            learning_goal: 'travel',
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
      courseStudent: false,
      done: ['first_lesson'],
      diamonds: 20,
      reward: 10,
      nativeLanguage: 'ru',
      learningGoal: 'travel',
      targetLanguages: ['en', 'de'],
      extraStarterLanguages: [],
    });
  });
});

describe('startCourseStudentTasks', () => {
  it('только ученик курса без стартового набора, один раз', async () => {
    const f = fakeSql([
      { match: /UPDATE users SET start_tasks_at/, rows: [{ start_tasks_at: 1 }] },
    ]);
    expect(await startCourseStudentTasks(f.sql, ME)).toEqual({ started: true });
    expect(f.calls[0].text).toMatch(/start_tasks_at IS NULL AND starter_set_id IS NULL/);
    expect(f.calls[0].text).toMatch(/cm.role = 'student'/);
  });
});

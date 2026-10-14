import { describe, expect, it } from '@jest/globals';
// Арбитр пушей живёт на сервере (api/push), но логика выбора — чистая функция, тестируем здесь
// (в api/ нельзя класть тесты: Vercel сделал бы из них функции).
import { backoffReason, decide, eligiblePushes, isHoldout } from '../../../api/push/_decide.js';

// Не в контрольной группе: последние 7 hex = 0x000000a → 10 % 100 = 10
const USER = '00000000-0000-4000-8000-00000000000a';
// В контрольной группе: 0x0000005 → 5
const HOLDOUT_USER = '00000000-0000-4000-8000-000000000005';

const base = {
  userId: USER,
  today: '2026-10-14',
  dow: 'wed',
  doneToday: false,
  daysAway: 1,
  streak: 4,
  notifStreak: true,
  fading: 0,
  waiting: 0,
  rating: null,
  weekly: null,
  groupsOff: [],
  ignored: 0,
  lastSentDay: null,
  lastSentByType: {},
};

describe('арбитр пушей', () => {
  it('выбирает самый важный тип', () => {
    expect(decide({ ...base, fading: 7, waiting: 12 })).toMatchObject({ status: 'send', type: 'words_fading', data: { count: 7 } });
    expect(decide({ ...base, waiting: 40 })).toMatchObject({ status: 'send', type: 'review_due', data: { count: 30 } });
    expect(decide({ ...base, dow: 'sun', rating: { place: 3, gap: 40 }, waiting: 5 })).toMatchObject({ type: 'rating_sunday' });
    expect(decide(base)).toMatchObject({ status: 'send', type: 'streak_reminder' });
  });

  it('урок сделан — только рейтинг и итоги, остальное молчит', () => {
    expect(decide({ ...base, doneToday: true, waiting: 10 })).toEqual({ status: 'skip', reason: 'done_today' });
    expect(decide({ ...base, doneToday: true, dow: 'mon', weekly: { place: 2, reward: 30 } })).toMatchObject({ type: 'weekly_result' });
  });

  it('возврат через 3 и 7 дней', () => {
    expect(eligiblePushes({ ...base, streak: 0, daysAway: 3 }).map((p) => p.type)).toEqual(['reactivation_3d']);
    expect(eligiblePushes({ ...base, streak: 0, daysAway: 7 }).map((p) => p.type)).toEqual(['reactivation_7d']);
  });

  it('выключенная категория пропускается, берётся следующая', () => {
    expect(decide({ ...base, waiting: 12, groupsOff: ['lesson'] })).toMatchObject({ status: 'send', type: 'streak_reminder' });
    expect(decide({ ...base, waiting: 12, groupsOff: ['lesson', 'streak'] })).toMatchObject({ status: 'category_off', type: 'review_due' });
  });

  it('контрольная группа не получает маркетинговых пушей', () => {
    expect(isHoldout(HOLDOUT_USER)).toBe(true);
    expect(isHoldout(USER)).toBe(false);
    expect(decide({ ...base, userId: HOLDOUT_USER, waiting: 12 })).toMatchObject({ status: 'holdout', type: 'review_due' });
  });

  it('контрольная группа — около 10 %', () => {
    let n = 0;
    for (let i = 0; i < 10000; i++) {
      const hex = (i * 2654435761 % 0xfffffff).toString(16).padStart(12, '0');
      if (isHoldout(`00000000-0000-4000-8000-${hex}`)) n++;
    }
    expect(n).toBeGreaterThan(800);
    expect(n).toBeLessThan(1200);
  });

  it('режим игнора: через день, раз в неделю, только возврат', () => {
    expect(backoffReason(2, '2026-10-13', '2026-10-14', 'lesson')).toBeNull();
    expect(backoffReason(3, '2026-10-13', '2026-10-14', 'lesson')).toBe('backoff_3');
    expect(backoffReason(3, '2026-10-12', '2026-10-14', 'lesson')).toBeNull();
    expect(backoffReason(7, '2026-10-09', '2026-10-14', 'lesson')).toBe('backoff_7');
    expect(backoffReason(7, '2026-10-07', '2026-10-14', 'lesson')).toBeNull();
    expect(backoffReason(14, null, '2026-10-14', 'lesson')).toBe('backoff_14');
    expect(backoffReason(14, null, '2026-10-14', 'reactivation')).toBeNull();
    expect(decide({ ...base, waiting: 12, ignored: 3, lastSentDay: '2026-10-13' })).toMatchObject({ status: 'backoff', type: 'review_due', reason: 'backoff_3' });
    expect(decide({ ...base, streak: 0, daysAway: 7, waiting: 12, ignored: 14 })).toMatchObject({ status: 'send', type: 'reactivation_7d' });
  });
});
